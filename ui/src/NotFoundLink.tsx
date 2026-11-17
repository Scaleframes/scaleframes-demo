import {Box, Button, Typography} from '@mui/material';
import {BrandHeader} from './Brand';

const text = {
    sv: [
        'Länken finns inte',
        'Kontrollera stavningen eller be din kontakt på Scaleframes om länken igen.',
    ],
    es: [
        'Este enlace no existe',
        'Revisa cómo está escrito o pide el enlace otra vez a tu contacto de Scaleframes.',
    ],
    en: [
        'This link does not exist',
        'Check the spelling or ask your contact at Scaleframes for the link again.',
    ],
};

// Shown for a mistyped demo link, for example demo.scaleframes.com/lucas.
export const NotFoundLink = () => {
    const lang = navigator.language.slice(0, 2);
    const [title, body] = text[lang as keyof typeof text] ?? text.en;
    return (
        <Box sx={{minHeight: '100%', bgcolor: 'background.default'}}>
            <BrandHeader />
            <Box sx={{textAlign: 'center', maxWidth: 440, mx: 'auto', px: 2, py: 10}}>
                <Typography variant="h5" component="h1" sx={{mb: 1.5}}>
                    {title}
                </Typography>
                <Typography color="text.secondary" sx={{mb: 3}}>
                    {body}
                </Typography>
                <Button variant="outlined" color="secondary" href="https://scaleframes.com">
                    scaleframes.com
                </Button>
            </Box>
        </Box>
    );
};
