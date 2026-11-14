import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/familjen-grotesk/600.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import './global.css';
import {Button, createTheme, CssBaseline, ThemeProvider, StyledEngineProvider} from '@mui/material';
import {Router} from './Router';
import {SnackbarProvider} from 'notistack';

const ink = '#1C1917';
const line = '#E4DDD0';

const theme = createTheme({
    typography: {
        fontFamily: '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
        h1: {fontFamily: '"Familjen Grotesk", sans-serif', fontWeight: 600},
        h2: {fontFamily: '"Familjen Grotesk", sans-serif', fontWeight: 600},
        h3: {fontFamily: '"Familjen Grotesk", sans-serif', fontWeight: 600},
        h4: {fontFamily: '"Familjen Grotesk", sans-serif', fontWeight: 600},
        h5: {fontFamily: '"Familjen Grotesk", sans-serif', fontWeight: 600},
        h6: {fontFamily: '"Familjen Grotesk", sans-serif', fontWeight: 600},
        button: {textTransform: 'none', fontWeight: 600},
    },
    shape: {borderRadius: 12},
    components: {
        MuiPaper: {
            defaultProps: {elevation: 0},
            styleOverrides: {root: {border: `1px solid ${line}`}},
        },
        MuiButton: {
            defaultProps: {disableElevation: true},
            styleOverrides: {root: {borderRadius: 999, paddingLeft: 20, paddingRight: 20}},
        },
        MuiLink: {styleOverrides: {root: {color: ink}}},
        MuiIconButton: {styleOverrides: {root: {color: 'inherit'}}},
        MuiListItemIcon: {styleOverrides: {root: {color: 'inherit'}}},
        MuiTooltip: {styleOverrides: {tooltip: {fontSize: '0.9em'}}},
    },
    palette: {
        mode: 'light',
        background: {default: '#FCFBF8', paper: '#F7F4ED'},
        text: {primary: ink, secondary: '#57534E'},
        primary: {main: '#FF6B00', contrastText: '#FFFFFF'},
        secondary: {main: ink},
        divider: line,
    },
});

const Snackbar: React.FC<React.PropsWithChildren> = ({children}) => {
    const notistackRef = React.createRef<any>();
    const onClickDismiss = (key: unknown) => () => {
        notistackRef.current?.closeSnackbar(key);
    };

    return (
        <SnackbarProvider
            maxSnack={3}
            ref={notistackRef}
            action={(key) => (
                <Button onClick={onClickDismiss(key)} size="small">
                    Dismiss
                </Button>
            )}
        >
            {children}
        </SnackbarProvider>
    );
};

ReactDOM.createRoot(document.getElementById('root')!!).render(
    <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
            <Snackbar>
                <CssBaseline />
                <Router />
            </Snackbar>
        </ThemeProvider>
    </StyledEngineProvider>
);
