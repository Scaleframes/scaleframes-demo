package ws

import (
	"testing"
	"time"

	"github.com/rs/xid"
	"github.com/screego/server/auth"
	"github.com/screego/server/config"
	"github.com/screego/server/sf"
	"github.com/screego/server/ws/outgoing"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestRooms() *Rooms {
	sellers := sf.Sellers{"lukas": {Slug: "lukas", Name: "Lukas", Lang: "en"}}
	return NewRooms(nil, &auth.Users{}, config.Config{AuthMode: config.AuthModeAll}, sellers, nil)
}

func sellerClient(user string) ClientInfo {
	return ClientInfo{ID: xid.New(), Authenticated: user != "", AuthenticatedUser: user, Write: make(chan outgoing.Message, 10)}
}

func TestSellerLinkBelongsToSeller(t *testing.T) {
	rooms := newTestRooms()
	other := sellerClient("filip")
	rooms.connected[other.ID] = ""
	err := (&Create{ID: "lukas", Mode: ConnectionTURN}).Execute(rooms, other)
	assert.EqualError(t, err, "this demo link belongs to another seller")

	owner := sellerClient("lukas")
	rooms.connected[owner.ID] = ""
	require.NoError(t, (&Create{ID: "lukas", Mode: ConnectionTURN, ContactID: "42"}).Execute(rooms, owner))
	demo := rooms.Rooms["lukas"].Demo
	require.NotNil(t, demo)
	assert.Equal(t, "lukas", demo.Seller)
	assert.Equal(t, "42", demo.ContactID)
}

func TestDemoViewerTime(t *testing.T) {
	room := &Room{Demo: &sf.Demo{}, viewersSince: map[xid.ID]time.Time{}}
	start := time.Now()
	a, b := xid.New(), xid.New()

	room.viewerJoined(a, start)
	room.viewerJoined(b, start.Add(5*time.Second))
	room.viewerLeft(a, start.Add(20*time.Second))
	room.viewerLeft(b, start.Add(10*time.Second))
	room.viewerLeft(xid.New(), start.Add(30*time.Second)) // owner or unknown: no time

	assert.Equal(t, start, room.Demo.FirstViewerAt)
	assert.Equal(t, 25*time.Second, room.Demo.ViewerTime)
	assert.Equal(t, 2, room.Demo.PeakViewers)
	assert.True(t, room.Demo.Watched())
}
