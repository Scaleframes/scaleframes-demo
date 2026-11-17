package router

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog/hlog"
	"github.com/rs/zerolog/log"
	"github.com/screego/server/auth"
	"github.com/screego/server/config"
	"github.com/screego/server/sf"
	"github.com/screego/server/ui"
	"github.com/screego/server/ws"
)

type Health struct {
	Status  string `json:"status"`
	Clients int    `json:"clients"`
	Reason  string `json:"reason,omitempty"`
}

type UIConfig struct {
	AuthMode                 string `json:"authMode"`
	User                     string `json:"user"`
	LoggedIn                 bool   `json:"loggedIn"`
	Version                  string `json:"version"`
	RoomName                 string `json:"roomName"`
	CloseRoomWhenOwnerLeaves bool   `json:"closeRoomWhenOwnerLeaves"`
	// Seller is the profile of the logged-in user. ViewSeller is the seller of ?seller=<slug>.
	Seller     *sf.Seller `json:"seller,omitempty"`
	ViewSeller *sf.Seller `json:"viewSeller,omitempty"`
	HubSpot    bool       `json:"hubspot"`
}

var sellerPath = regexp.MustCompile(`^/[a-z0-9-]{2,32}/?$`)

func Router(conf config.Config, rooms *ws.Rooms, users *auth.Users, version string, sellers sf.Sellers, hubspot *sf.HubSpot) *mux.Router {
	router := mux.NewRouter()
	router.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// https://github.com/gorilla/mux/issues/416
		accessLogger(r, 404, 0, 0)
	})
	router.Use(hlog.AccessHandler(accessLogger))
	router.Use(handlers.CORS(handlers.AllowedMethods([]string{"GET", "POST"}), handlers.AllowedOriginValidator(conf.CheckOrigin)))
	router.HandleFunc("/stream", rooms.Upgrade)
	router.Methods("POST").Path("/login").HandlerFunc(users.Authenticate)
	router.Methods("POST").Path("/logout").HandlerFunc(users.Logout)
	router.Methods("GET").Path("/config").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, loggedIn := users.CurrentUser(r)
		uiConf := &UIConfig{
			AuthMode:                 conf.AuthMode,
			LoggedIn:                 loggedIn,
			User:                     user,
			Version:                  version,
			RoomName:                 rooms.RandRoomName(),
			CloseRoomWhenOwnerLeaves: conf.CloseRoomWhenOwnerLeaves,
			HubSpot:                  hubspot != nil,
		}
		if seller, ok := sellers[user]; ok && loggedIn {
			uiConf.Seller = &seller
		}
		if seller, ok := sellers[r.URL.Query().Get("seller")]; ok {
			public := sf.Seller{Slug: seller.Slug, Name: seller.Name, Lang: seller.Lang}
			uiConf.ViewSeller = &public
		}
		_ = json.NewEncoder(w).Encode(uiConf)
	})
	router.Methods("GET").Path("/api/contacts").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, loggedIn := users.CurrentUser(r); !loggedIn {
			w.WriteHeader(401)
			return
		}
		if hubspot == nil {
			w.WriteHeader(404)
			return
		}
		contacts, err := hubspot.SearchContacts(r.Context(), r.URL.Query().Get("q"))
		if err != nil {
			log.Error().Err(err).Msg("HubSpot contact search")
			w.WriteHeader(502)
			return
		}
		_ = json.NewEncoder(w).Encode(contacts)
	})
	router.Methods("GET").Path("/health").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i, err := rooms.Count()
		status := "up"
		if err != "" {
			status = "down"
			w.WriteHeader(500)
		}
		_ = json.NewEncoder(w).Encode(Health{
			Status:  status,
			Clients: i,
			Reason:  err,
		})
	})
	if conf.Prometheus {
		log.Info().Msg("Prometheus enabled")
		router.Methods("GET").Path("/metrics").Handler(basicAuth(promhttp.Handler(), users))
	}

	base := strings.TrimSuffix(conf.PublicURL, "/")
	ui.Register(router, ui.Meta{
		Lang:        "en",
		Title:       "Scaleframes Demo",
		Description: "Live screen sharing from Scaleframes.",
		URL:         base + "/",
		Image:       base + "/og-banner.png",
	})
	// A mistyped demo link gets the branded page with a "link not found" message.
	notFoundPage := ui.Index(ui.Meta{Lang: "en", Title: "Scaleframes Demo", Description: "Live screen sharing from Scaleframes.", URL: base + "/", Image: base + "/og-banner.png"})
	router.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		accessLogger(r, 404, 0, 0)
		if r.Method == http.MethodGet && sellerPath.MatchString(r.URL.Path) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			notFoundPage(w, r)
		}
	})
	// Seller demo links: /<slug>.
	for slug, seller := range sellers {
		title, description := seller.Preview()
		router.Methods("GET").Path("/" + slug).Handler(ui.Index(ui.Meta{
			Lang:        seller.Lang,
			Title:       title,
			Description: description,
			URL:         base + "/" + slug,
			Image:       base + "/og-banner.png",
		}))
	}

	return router
}

func accessLogger(r *http.Request, status, size int, dur time.Duration) {
	log.Debug().
		Str("host", r.Host).
		Int("status", status).
		Int("size", size).
		Str("ip", r.RemoteAddr).
		Str("path", r.URL.Path).
		Str("duration", dur.String()).
		Msg("HTTP")
}

func basicAuth(handler http.Handler, users *auth.Users) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()

		if !ok || !users.Validate(user, pass) {
			w.Header().Set("WWW-Authenticate", `Basic realm="screego"`)
			w.WriteHeader(401)
			_, _ = w.Write([]byte("Unauthorized.\n"))
			return
		}

		handler.ServeHTTP(w, r)
	}
}
