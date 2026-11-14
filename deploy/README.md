# Scaleframes Demo – driftguide

Scaleframes Demo är en egen version av Screego (GPL-3.0). Säljaren delar en flik i Chrome. Kunden öppnar `https://demo.scaleframes.com/<säljare>` i valfri webbläsare, även i mobilen, utan konto och utan nedladdning. Ljudet går i telefonsamtalet som vanligt.

## Så fungerar det

| Del | Vad den gör |
|---|---|
| `demo.scaleframes.com/` | Inloggning och säljvy. Säljaren väljer kund i HubSpot och startar skärmdelningen. |
| `demo.scaleframes.com/lukas` | Kundens länk. Visar en väntesida tills säljaren startar, sedan bilden live. Förhandsvisning med Scaleframes-logga i WhatsApp, SMS och mejl. |
| TURN-relä (port 3478 och 50000–50200) | Gör att bilden går fram även på 4G och bakom brandväggar. |
| HubSpot | När demon avslutas loggas ett möte "Screen demo (Scaleframes Demo)" på kontakten. Om kunden tittade i minst 15 sekunder sätts `sf_demo_visad = true` och `sf_senaste_demo`. |

Bara inloggade säljare kan starta en demo. En säljare kan bara sända på sin egen länk.

## 1. Server

En liten VPS räcker (1 vCPU, 1 GB RAM). Den behöver en publik IPv4-adress och Docker.

Öppna i serverns brandvägg:

- `3478/udp` och `3478/tcp` (TURN)
- `50000-50200/udp` (TURN-reläportar)

Port 80 och 443 behöver inte öppnas. Webbtrafiken går via Cloudflare Tunnel.

## 2. Cloudflare

1. Cloudflare → Zero Trust → Networks → Tunnels → **Create a tunnel** (typ Cloudflared). Namn: `scaleframes-demo`.
2. Kopiera tunnelns token.
3. Lägg till en **Public hostname**: `demo.scaleframes.com` → tjänst `HTTP`, URL `127.0.0.1:5050`.
4. Cloudflare skapar DNS-posten själv. WebSockets fungerar via tunneln utan extra inställningar.

TURN-reläet går direkt till serverns IP-adress och påverkas inte av Cloudflare.

## 3. HubSpot

1. HubSpot → Inställningar → Integrationer → **Private apps** → skapa appen "Scaleframes Demo".
2. Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.owners.read`.
3. Kopiera token till `SCREEGO_HUBSPOT_TOKEN`.
4. Kontaktegenskaperna `sf_demo_visad` (Skärmdemo visad, ja/nej) och `sf_senaste_demo` (Senaste skärmdemo, datum) måste finnas.

Säljarens e-post i `sellers.json` ska vara samma som i HubSpot. Då blir säljaren ägare till mötet.

## 4. Säljare

`sellers.json` (se `sellers.example.json`):

- `slug`: inloggningsnamn och länk, till exempel `lukas` → `demo.scaleframes.com/lukas`. Bara a–z, 0–9 och bindestreck.
- `name`: namnet kunden ser.
- `lang`: språk på kundsidan och förhandsvisningen: `sv`, `en` eller `es`.
- `email`: säljarens e-post i HubSpot.

Lösenord (en rad per säljare i filen `users`). Skapa filen först med `touch users`, annars skapar Docker en mapp med det namnet.

```sh
docker compose run --rm demo hash --name lukas --pass 'ETT-STARKT-LÖSENORD' >> users
```

Ta bort en säljare: ta bort raden i `users` och posten i `sellers.json`, och starta om.

## 5. Starta

```sh
cd deploy
cp screego.env.example screego.env      # fyll i CHANGE-värdena
cp sellers.example.json sellers.json    # fyll i säljarna
echo "CLOUDFLARE_TUNNEL_TOKEN=<token>" > .env
docker compose up -d --build
docker compose logs -f demo
```

Kontroll: `https://demo.scaleframes.com/health` ska svara `{"status":"up",...}`.

Test före första kundsamtalet: starta en demo från datorn och öppna länken i mobilen med wifi avstängt (4G).

## Säljarens flöde

1. Öppna `demo.scaleframes.com` i Chrome (bokmärk den). Inloggningen sparas i 30 dagar.
2. Sök fram kunden (namn, företag, telefon eller e-post) och välj kontakten.
3. Klicka **Start screen share** och välj fliken med exempelsajten.
4. Klicka **Copy** och skicka länken till kunden, eller säg den högt.
5. Säljvyn visar när kunden tittar. Klicka **End demo** när ni är klara.

Tips: dela en flik, inte hela skärmen. Visa sajten i mobilvy (Chrome DevTools → enhetsläge) om kunden tittar i mobilen.

## Statistik i HubSpot

- **Med och utan demo:** filtrera samtal, affärer eller kontakter på kontaktegenskapen *Skärmdemo visad*.
- **Antal demos per säljare:** möten med titeln "Screen demo (Scaleframes Demo)", grupperade på ägare.
- **Visad eller inte:** mötets utfall är *Completed* om kunden tittade och *No show* om kunden inte öppnade länken.
