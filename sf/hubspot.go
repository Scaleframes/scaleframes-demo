package sf

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

const hubspotAPI = "https://api.hubapi.com"

// WatchedThreshold is the minimum viewer time that counts as "the customer saw the demo".
const WatchedThreshold = 15 * time.Second

// HubSpot logs demos on contacts. A nil *HubSpot is valid and does nothing.
type HubSpot struct {
	api       string
	token     string
	publicURL string
	sellers   Sellers
	client    *http.Client

	ownerLock sync.Mutex
	owners    map[string]string // seller email -> HubSpot owner id
}

func NewHubSpot(token, publicURL string, sellers Sellers) *HubSpot {
	if token == "" {
		return nil
	}
	return &HubSpot{
		api:       hubspotAPI,
		token:     token,
		publicURL: strings.TrimSuffix(publicURL, "/"),
		sellers:   sellers,
		client:    &http.Client{Timeout: 10 * time.Second},
		owners:    map[string]string{},
	}
}

type Contact struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Company string `json:"company"`
	Email   string `json:"email"`
	Phone   string `json:"phone"`
}

// SearchContacts does a HubSpot full-text search (name, email, phone, company).
func (h *HubSpot) SearchContacts(ctx context.Context, query string) ([]Contact, error) {
	body := map[string]any{
		"query":      query,
		"limit":      6,
		"properties": []string{"firstname", "lastname", "email", "phone", "mobilephone", "company"},
	}
	var res struct {
		Results []struct {
			ID         string            `json:"id"`
			Properties map[string]string `json:"properties"`
		} `json:"results"`
	}
	if err := h.do(ctx, http.MethodPost, "/crm/v3/objects/contacts/search", body, &res); err != nil {
		return nil, err
	}
	contacts := make([]Contact, 0, len(res.Results))
	for _, r := range res.Results {
		p := r.Properties
		phone := p["phone"]
		if phone == "" {
			phone = p["mobilephone"]
		}
		contacts = append(contacts, Contact{
			ID:      r.ID,
			Name:    strings.TrimSpace(p["firstname"] + " " + p["lastname"]),
			Company: p["company"],
			Email:   p["email"],
			Phone:   phone,
		})
	}
	return contacts, nil
}

// Demo is the result of one demo room, reported when the room closes.
type Demo struct {
	Seller        string
	ContactID     string
	StartedAt     time.Time
	EndedAt       time.Time
	FirstViewerAt time.Time
	ViewerTime    time.Duration
	PeakViewers   int
}

func (d Demo) Watched() bool { return d.ViewerTime >= WatchedThreshold }

// Report sends the demo to HubSpot in the background, so it never blocks the room loop.
func (h *HubSpot) Report(d Demo) {
	if h == nil {
		return
	}
	if d.ContactID == "" {
		log.Info().Str("seller", d.Seller).Dur("viewerTime", d.ViewerTime).Msg("Demo ended without HubSpot contact, not reported")
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		if err := h.report(ctx, d); err != nil {
			log.Error().Err(err).Str("seller", d.Seller).Str("contact", d.ContactID).Msg("HubSpot demo report failed")
			return
		}
		log.Info().Str("seller", d.Seller).Str("contact", d.ContactID).Bool("watched", d.Watched()).Msg("HubSpot demo reported")
	}()
}

func (h *HubSpot) report(ctx context.Context, d Demo) error {
	seller := h.sellers[d.Seller]
	outcome := "NO_SHOW"
	if d.Watched() {
		outcome = "COMPLETED"
	}
	props := map[string]string{
		"hs_timestamp":          d.StartedAt.UTC().Format(time.RFC3339),
		"hs_meeting_start_time": d.StartedAt.UTC().Format(time.RFC3339),
		"hs_meeting_end_time":   d.EndedAt.UTC().Format(time.RFC3339),
		"hs_meeting_title":      "Screen demo (Scaleframes Demo)",
		"hs_meeting_outcome":    outcome,
		"hs_meeting_body":       demoBody(d, seller, h.publicURL),
	}
	if seller.Email != "" {
		ownerID, err := h.ownerID(ctx, seller.Email)
		if err != nil {
			return err
		}
		if ownerID != "" {
			props["hubspot_owner_id"] = ownerID
		}
	}
	meeting := map[string]any{
		"properties": props,
		"associations": []any{map[string]any{
			"to": map[string]string{"id": d.ContactID},
			// 200 = HubSpot-defined meeting -> contact association.
			"types": []any{map[string]any{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 200}},
		}},
	}
	if err := h.do(ctx, http.MethodPost, "/crm/v3/objects/meetings", meeting, nil); err != nil {
		return fmt.Errorf("create meeting: %w", err)
	}
	if !d.Watched() {
		return nil
	}
	contact := map[string]any{"properties": map[string]string{
		"sf_demo_visad":   "true",
		"sf_senaste_demo": d.StartedAt.UTC().Format("2006-01-02"),
	}}
	if err := h.do(ctx, http.MethodPatch, "/crm/v3/objects/contacts/"+d.ContactID, contact, nil); err != nil {
		return fmt.Errorf("update contact: %w", err)
	}
	return nil
}

func demoBody(d Demo, seller Seller, publicURL string) string {
	watched := "No, the customer did not open the link"
	if !d.FirstViewerAt.IsZero() {
		watched = fmt.Sprintf("Yes, %s", d.ViewerTime.Round(time.Second))
		if !d.Watched() {
			watched = fmt.Sprintf("Opened, but only %s", d.ViewerTime.Round(time.Second))
		}
	}
	name := seller.Name
	if name == "" {
		name = d.Seller
	}
	return fmt.Sprintf("Seller: %s<br>Customer watched: %s<br>Demo length: %s<br>Link: %s/%s",
		name, watched, d.EndedAt.Sub(d.StartedAt).Round(time.Second), publicURL, d.Seller)
}

func (h *HubSpot) ownerID(ctx context.Context, email string) (string, error) {
	h.ownerLock.Lock()
	id, ok := h.owners[email]
	h.ownerLock.Unlock()
	if ok {
		return id, nil
	}
	var res struct {
		Results []struct {
			ID string `json:"id"`
		} `json:"results"`
	}
	if err := h.do(ctx, http.MethodGet, "/crm/v3/owners/?limit=1&email="+url.QueryEscape(email), nil, &res); err != nil {
		return "", fmt.Errorf("owner lookup: %w", err)
	}
	if len(res.Results) > 0 {
		id = res.Results[0].ID
	}
	h.ownerLock.Lock()
	h.owners[email] = id
	h.ownerLock.Unlock()
	return id, nil
}

// do sends one request. It retries once on 429 and 5xx.
func (h *HubSpot) do(ctx context.Context, method, path string, in, out any) error {
	var payload []byte
	if in != nil {
		var err error
		if payload, err = json.Marshal(in); err != nil {
			return err
		}
	}
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, h.api+path, bytes.NewReader(payload))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+h.token)
		req.Header.Set("Content-Type", "application/json")
		resp, err := h.client.Do(req)
		if err != nil {
			if attempt == 0 {
				continue
			}
			return err
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if (resp.StatusCode == 429 || resp.StatusCode >= 500) && attempt == 0 {
			select {
			case <-time.After(2 * time.Second):
				continue
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		if resp.StatusCode >= 300 {
			return fmt.Errorf("hubspot %s %s: %d %s", method, path, resp.StatusCode, raw)
		}
		if out == nil {
			return nil
		}
		return json.Unmarshal(raw, out)
	}
}
