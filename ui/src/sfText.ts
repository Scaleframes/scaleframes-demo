import {Seller} from './message';

// Customer-facing text, in the language of the seller.
const viewerText = {
    sv: {
        connecting: 'Ansluter till visningen …',
        tapToView: 'Tryck för att se skärmen',
        troubleTitle: 'Bilden kommer inte fram',
        troubleBody: 'Prova att byta mellan wifi och mobildata. Vi försöker igen automatiskt.',
        inAppHint: 'Öppna länken i Safari eller Chrome för bästa bild.',
        waitingTitle: (name: string) => `${name} startar visningen om ett ögonblick`,
        waitingBody: 'Stanna kvar i samtalet. Skärmen visas här automatiskt.',
        pausedTitle: (name: string) => `${name} har pausat visningen`,
        live: 'LIVE',
        sharing: (name: string) => `${name} visar sin skärm`,
        endedTitle: 'Visningen är avslutad',
        endedBody: 'Tack för att du tittade.',
        visit: 'Till scaleframes.com',
        secure: 'Säker, krypterad anslutning',
        fullscreen: 'Helskärm',
        expiredTitle: 'Ingen visning just nu',
        expiredBody: 'Be din kontakt på Scaleframes att skicka länken igen.',
        retry: 'Försök igen',
    },
    en: {
        connecting: 'Connecting to the session …',
        tapToView: 'Tap to view the screen',
        troubleTitle: 'The picture is not coming through',
        troubleBody: 'Try switching between Wi-Fi and mobile data. We keep trying automatically.',
        inAppHint: 'Open the link in Safari or Chrome for the best picture.',
        waitingTitle: (name: string) => `${name} is about to start sharing`,
        waitingBody: 'Stay on the call. The screen appears here automatically.',
        pausedTitle: (name: string) => `${name} has paused the screen share`,
        live: 'LIVE',
        sharing: (name: string) => `${name} is sharing their screen`,
        endedTitle: 'The session has ended',
        endedBody: 'Thank you for watching.',
        visit: 'Go to scaleframes.com',
        secure: 'Secure, encrypted connection',
        fullscreen: 'Full screen',
        expiredTitle: 'No session right now',
        expiredBody: 'Ask your contact at Scaleframes to send the link again.',
        retry: 'Try again',
    },
    es: {
        connecting: 'Conectando con la sesión …',
        tapToView: 'Toca para ver la pantalla',
        troubleTitle: 'La imagen no llega',
        troubleBody:
            'Prueba a cambiar entre wifi y datos móviles. Seguimos intentándolo automáticamente.',
        inAppHint: 'Abre el enlace en Safari o Chrome para ver mejor la imagen.',
        waitingTitle: (name: string) => `${name} va a empezar a compartir en un momento`,
        waitingBody: 'Sigue en la llamada. La pantalla aparecerá aquí automáticamente.',
        pausedTitle: (name: string) => `${name} ha pausado la pantalla`,
        live: 'EN DIRECTO',
        sharing: (name: string) => `${name} está compartiendo su pantalla`,
        endedTitle: 'La sesión ha terminado',
        endedBody: 'Gracias por tu tiempo.',
        visit: 'Ir a scaleframes.com',
        secure: 'Conexión segura y cifrada',
        fullscreen: 'Pantalla completa',
        expiredTitle: 'No hay ninguna sesión ahora',
        expiredBody: 'Pide a tu contacto de Scaleframes que te envíe el enlace otra vez.',
        retry: 'Intentar de nuevo',
    },
};

export const textFor = (seller: Seller) => viewerText[seller.lang] ?? viewerText.en;

// A short device label the seller sees, for example "iPhone · Safari".
export const deviceLabel = (): string => {
    const ua = navigator.userAgent;
    const device = /iPhone/.test(ua)
        ? 'iPhone'
        : /iPad/.test(ua)
          ? 'iPad'
          : /Android/.test(ua)
            ? 'Android'
            : /Macintosh/.test(ua)
              ? 'Mac'
              : /Windows/.test(ua)
                ? 'Windows'
                : 'Computer';
    const browser = inAppBrowser()
        ? 'in-app browser'
        : /EdgA?\//.test(ua)
          ? 'Edge'
          : /CriOS|Chrome\//.test(ua)
            ? 'Chrome'
            : /FxiOS|Firefox\//.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Browser';
    return `${device} · ${browser}`;
};

// Browsers inside other apps (Instagram, Facebook, LinkedIn, TikTok) can block video.
export const inAppBrowser = (): boolean =>
    /FBAN|FBAV|Instagram|LinkedInApp|BytedanceWebview|musical_ly|Line\//.test(navigator.userAgent);
