import {Seller} from './message';

// Customer-facing text, in the language of the seller.
const viewerText = {
    sv: {
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
