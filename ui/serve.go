package ui

import (
	"embed"
	"html"
	"io"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/rs/zerolog/log"
)

//go:embed build
var buildFiles embed.FS
var files, _ = fs.Sub(buildFiles, "build")

// Meta fills the link preview tags (og:*) of index.html.
type Meta struct {
	Lang        string
	Title       string
	Description string
	URL         string
	Image       string
}

// Register registers the ui on the root path.
func Register(r *mux.Router, meta Meta) {
	r.Handle("/", Index(meta))
	r.Handle("/index.html", Index(meta))
	r.Handle("/assets/{resource}", http.FileServer(http.FS(files)))

	r.Handle("/favicon.ico", serveFile("favicon.ico", "image/x-icon"))
	r.Handle("/logo.png", serveFile("logo.png", "image/png"))
	r.Handle("/apple-touch-icon.png", serveFile("apple-touch-icon.png", "image/png"))
	r.Handle("/og-banner.png", serveFile("og-banner.png", "image/png"))
}

// Index serves index.html with the preview tags filled in.
func Index(meta Meta) http.HandlerFunc {
	raw, err := fs.ReadFile(files, "index.html")
	if err != nil {
		log.Panic().Err(err).Msg("could not read index.html")
	}
	page := []byte(strings.NewReplacer(
		"__SF_LANG__", html.EscapeString(meta.Lang),
		"__SF_TITLE__", html.EscapeString(meta.Title),
		"__SF_DESC__", html.EscapeString(meta.Description),
		"__SF_URL__", html.EscapeString(meta.URL),
		"__SF_IMAGE__", html.EscapeString(meta.Image),
	).Replace(string(raw)))
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(page)
	}
}

func serveFile(name, contentType string) http.HandlerFunc {
	file, err := files.Open(name)
	if err != nil {
		log.Panic().Err(err).Msgf("could not find %s", file)
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		log.Panic().Err(err).Msgf("could not read %s", file)
	}

	return func(writer http.ResponseWriter, reg *http.Request) {
		writer.Header().Set("Content-Type", contentType)
		_, _ = writer.Write(content)
	}
}
