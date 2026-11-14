// Package sf holds the Scaleframes additions: seller profiles and HubSpot tracking.
package sf

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
)

// Seller is the public profile of a user from the users file.
// Slug is the users-file login name and the path of the demo link.
type Seller struct {
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	Lang  string `json:"lang"`
	Email string `json:"email,omitempty"`
}

type Sellers map[string]Seller

var slugPattern = regexp.MustCompile(`^[a-z0-9-]{2,32}$`)

// LoadSellers reads a JSON array of sellers. An empty path gives no sellers.
func LoadSellers(path string) (Sellers, error) {
	sellers := Sellers{}
	if path == "" {
		return sellers, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var list []Seller
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, fmt.Errorf("sellers file: %w", err)
	}
	for _, s := range list {
		if !slugPattern.MatchString(s.Slug) {
			return nil, fmt.Errorf("sellers file: invalid slug %q, use a-z, 0-9 and -", s.Slug)
		}
		switch s.Lang {
		case "sv", "en", "es":
		default:
			return nil, fmt.Errorf("sellers file: seller %q has lang %q, use sv, en or es", s.Slug, s.Lang)
		}
		sellers[s.Slug] = s
	}
	return sellers, nil
}

// Preview gives the link-preview title and description in the seller's language.
func (s Seller) Preview() (title, description string) {
	switch s.Lang {
	case "sv":
		return s.Name + " på Scaleframes visar dig skärmen",
			"Öppna länken för att se visningen live. Inget att ladda ner."
	case "es":
		return s.Name + " de Scaleframes te está mostrando su pantalla",
			"Abre el enlace para verlo en directo. No hace falta descargar nada."
	default:
		return s.Name + " from Scaleframes is sharing their screen",
			"Open the link to watch live. Nothing to download."
	}
}
