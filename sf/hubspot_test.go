package sf

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type call struct {
	Method, Path string
	Body         map[string]any
}

func fakeHubSpot(t *testing.T) (*HubSpot, *[]call) {
	calls := &[]call{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer token", r.Header.Get("Authorization"))
		c := call{Method: r.Method, Path: r.URL.RequestURI()}
		_ = json.NewDecoder(r.Body).Decode(&c.Body)
		*calls = append(*calls, c)
		if r.URL.Path == "/crm/v3/owners/" {
			_, _ = w.Write([]byte(`{"results":[{"id":"77"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(srv.Close)
	h := NewHubSpot("token", "https://demo.scaleframes.com/", Sellers{"lukas": {Slug: "lukas", Name: "Lukas", Email: "l@x.se"}})
	h.api = srv.URL
	return h, calls
}

func TestReportWatchedDemo(t *testing.T) {
	h, calls := fakeHubSpot(t)
	start := time.Date(2026, 11, 14, 10, 0, 0, 0, time.UTC)
	d := Demo{Seller: "lukas", ContactID: "42", StartedAt: start, EndedAt: start.Add(5 * time.Minute),
		FirstViewerAt: start.Add(time.Minute), ViewerTime: 3 * time.Minute, PeakViewers: 1}

	require.NoError(t, h.report(context.Background(), d))
	require.Len(t, *calls, 3)

	assert.Equal(t, "/crm/v3/owners/?limit=1&email=l%40x.se", (*calls)[0].Path)

	meeting := (*calls)[1]
	assert.Equal(t, "POST /crm/v3/objects/meetings", meeting.Method+" "+meeting.Path)
	props := meeting.Body["properties"].(map[string]any)
	assert.Equal(t, "COMPLETED", props["hs_meeting_outcome"])
	assert.Equal(t, "77", props["hubspot_owner_id"])
	assert.Contains(t, props["hs_meeting_body"], "Customer watched: Yes, 3m0s")
	assert.Contains(t, props["hs_meeting_body"], "https://demo.scaleframes.com/lukas")

	contact := (*calls)[2]
	assert.Equal(t, "PATCH /crm/v3/objects/contacts/42", contact.Method+" "+contact.Path)
	assert.Equal(t, map[string]any{"sf_demo_visad": "true", "sf_senaste_demo": "2026-11-14"}, contact.Body["properties"])
}

func TestReportUnwatchedDemoDoesNotMarkContact(t *testing.T) {
	h, calls := fakeHubSpot(t)
	start := time.Now()
	d := Demo{Seller: "lukas", ContactID: "42", StartedAt: start, EndedAt: start.Add(time.Minute)}

	require.NoError(t, h.report(context.Background(), d))
	require.Len(t, *calls, 2)
	props := (*calls)[1].Body["properties"].(map[string]any)
	assert.Equal(t, "NO_SHOW", props["hs_meeting_outcome"])
	assert.Contains(t, props["hs_meeting_body"], "did not open the link")
}
