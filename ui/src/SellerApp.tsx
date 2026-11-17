import React from 'react';
import {
    Box,
    Button,
    CircularProgress,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    TextField,
    Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PresentToAllIcon from '@mui/icons-material/PresentToAll';
import {useSnackbar} from 'notistack';
import QRCode from 'qrcode';
import {Contact, RoomMode, RoomUser, Seller} from './message';
import {UseConfig} from './useConfig';
import {useRoom} from './useRoom';
import {loadSettings} from './settings';
import {urlWithSlash} from './url';
import {BrandHeader, LivePill, PulseDot} from './Brand';
import {Video} from './Video';

export const SellerApp = ({config, seller}: {config: UseConfig; seller: Seller}) => {
    const {enqueueSnackbar} = useSnackbar();
    const [contact, setContact] = React.useState<Contact>();
    const [starting, setStarting] = React.useState(false);
    const endedByUser = React.useRef(false);
    const link = `${window.location.origin}/${seller.slug}`;
    const linkLabel = link.replace(/^https?:\/\//, '');

    const onClosed = React.useCallback(
        (reason: string) => {
            if (endedByUser.current) {
                endedByUser.current = false;
                enqueueSnackbar('Demo ended.', {variant: 'success'});
                return;
            }
            enqueueSnackbar(reason || 'The connection to the demo server was lost.', {
                variant: 'error',
                persist: true,
            });
        },
        [enqueueSnackbar]
    );
    const {state, room, share, stopShare} = useRoom(config, {syncURL: false, onClosed});

    const copyLink = () =>
        navigator.clipboard.writeText(link).then(
            () => enqueueSnackbar('Link copied. Send it to the customer.', {variant: 'success'}),
            () =>
                enqueueSnackbar('Could not copy. Select the link and copy it.', {variant: 'error'})
        );

    const start = async () => {
        let media: MediaStream;
        try {
            // Ask for the screen first, while the click still counts as a user gesture.
            media = await navigator.mediaDevices.getDisplayMedia({
                video: {frameRate: loadSettings().framerate, displaySurface: 'browser'},
                audio: false,
                selfBrowserSurface: 'exclude',
            } as DisplayMediaStreamOptions);
        } catch {
            return; // The seller cancelled the picker.
        }
        setStarting(true);
        const created = await room({
            type: 'create',
            payload: {
                id: seller.slug,
                mode: RoomMode.Turn,
                closeOnOwnerLeave: true,
                contactId: contact?.id,
            },
        });
        setStarting(false);
        if (!created) {
            media.getTracks().forEach((track) => track.stop());
            return;
        }
        share(media);
    };

    const end = () => {
        if (!state) return;
        endedByUser.current = true;
        stopShare();
        state.ws.close(1000, 'Demo ended');
        setContact(undefined);
    };

    const viewers = state ? state.users.filter((u) => !u.owner) : [];
    const connections = Object.values(state ? (state.hostConnections ?? {}) : {});

    return (
        <Box sx={{minHeight: '100%', bgcolor: 'background.default'}}>
            <BrandHeader
                right={
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                        {state && <LivePill label="LIVE" />}
                        <Typography
                            sx={{display: {xs: 'none', sm: 'block'}}}
                            color="text.secondary"
                        >
                            {seller.name}
                        </Typography>
                        {!state && (
                            <Button size="small" color="secondary" onClick={config.logout}>
                                Log out
                            </Button>
                        )}
                    </Box>
                }
            />
            <Box sx={{maxWidth: 560, mx: 'auto', px: 2, py: {xs: 3, sm: 6}}}>
                <Typography variant="h4" component="h1" sx={{mb: 1}}>
                    {state ? 'Your demo is live' : `Hi ${seller.name}`}
                </Typography>
                <Typography color="text.secondary" sx={{mb: 3}}>
                    {state
                        ? 'The customer sees the tab you picked. Switch to that tab and talk them through it.'
                        : 'Pick the customer, start the screen share, then send your link.'}
                </Typography>

                <Paper sx={{p: 2.5, mb: 2}}>
                    <Typography variant="overline" color="text.secondary">
                        Your demo link
                    </Typography>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <Typography
                            sx={{flex: 1, fontWeight: 600, fontSize: 18, wordBreak: 'break-all'}}
                        >
                            {linkLabel}
                        </Typography>
                        <Button
                            variant="outlined"
                            color="secondary"
                            startIcon={<ContentCopyIcon />}
                            onClick={copyLink}
                        >
                            Copy
                        </Button>
                    </Box>
                </Paper>

                {state ? (
                    <LivePanel
                        viewers={viewers}
                        connections={connections}
                        hostStream={state.hostStream}
                        contact={contact}
                        onResume={() => share()}
                        onEnd={end}
                    />
                ) : (
                    <>
                        {config.hubspot && (
                            <ContactPicker contact={contact} setContact={setContact} />
                        )}
                        <Button
                            fullWidth
                            size="large"
                            variant="contained"
                            startIcon={
                                starting ? (
                                    <CircularProgress size={20} color="inherit" />
                                ) : (
                                    <PresentToAllIcon />
                                )
                            }
                            disabled={starting}
                            onClick={start}
                            sx={{py: 1.5, fontSize: 17}}
                        >
                            Start screen share
                        </Button>
                        <Typography
                            color="text.secondary"
                            sx={{mt: 1.5, fontSize: 14, textAlign: 'center'}}
                        >
                            Tip: share one Chrome tab, not your whole screen.
                        </Typography>
                        <PhoneTest link={link} />
                    </>
                )}
            </Box>
        </Box>
    );
};

const LivePanel = ({
    viewers,
    connections,
    hostStream,
    contact,
    onResume,
    onEnd,
}: {
    viewers: RoomUser[];
    connections: RTCPeerConnectionState[];
    hostStream?: MediaStream;
    contact?: Contact;
    onResume: () => void;
    onEnd: () => void;
}) => (
    <Paper sx={{p: 2.5}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1}}>
            {connections.includes('connected') ? (
                <CheckCircleIcon sx={{color: '#16A34A'}} />
            ) : (
                <PulseDot size={12} />
            )}
            <Typography sx={{fontWeight: 600}}>
                {liveStatus(viewers.length, connections, !!hostStream)}
            </Typography>
        </Box>
        {viewers.length > 0 && (
            <Typography color="text.secondary" sx={{mb: 2, fontSize: 14}}>
                {viewers.map((v) => v.name).join(', ')}
            </Typography>
        )}
        {contact && (
            <Typography color="text.secondary" sx={{mb: 2, fontSize: 14}}>
                Logged in HubSpot on {contact.name || contact.email}
                {contact.company ? `, ${contact.company}` : ''} when you end the demo.
            </Typography>
        )}
        {hostStream ? (
            <Box
                sx={{
                    borderRadius: 2,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                    mb: 2,
                    bgcolor: '#1C1917',
                    '& video': {
                        width: '100%',
                        display: 'block',
                        maxHeight: 260,
                        objectFit: 'contain',
                    },
                }}
            >
                <Video src={hostStream} />
            </Box>
        ) : (
            <Box sx={{mb: 2}}>
                <Typography color="text.secondary" sx={{mb: 1}}>
                    The screen share is paused. The customer still sees the waiting page.
                </Typography>
                <Button variant="contained" onClick={onResume}>
                    Share a tab again
                </Button>
            </Box>
        )}
        <Button fullWidth variant="outlined" color="secondary" onClick={onEnd}>
            End demo
        </Button>
    </Paper>
);

const ContactPicker = ({
    contact,
    setContact,
}: {
    contact?: Contact;
    setContact: (c?: Contact) => void;
}) => {
    const [query, setQuery] = React.useState('');
    const [results, setResults] = React.useState<Contact[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            fetch(`${urlWithSlash}api/contacts?q=${encodeURIComponent(q)}`, {
                signal: controller.signal,
            })
                .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
                .then((list: Contact[]) => {
                    setResults(list);
                    setError(false);
                })
                .catch((err) => {
                    if (err?.name !== 'AbortError') setError(true);
                })
                .finally(() => setLoading(false));
        }, 300);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    if (contact) {
        return (
            <Paper sx={{p: 2.5, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5}}>
                <CheckCircleIcon sx={{color: '#16A34A'}} />
                <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography sx={{fontWeight: 600}}>
                        {contact.name || contact.email || contact.phone}
                    </Typography>
                    <Typography color="text.secondary" sx={{fontSize: 14}}>
                        {[contact.company, contact.phone, contact.email]
                            .filter(Boolean)
                            .join(' · ')}
                    </Typography>
                </Box>
                <IconButton aria-label="Change customer" onClick={() => setContact(undefined)}>
                    <CloseIcon />
                </IconButton>
            </Paper>
        );
    }

    return (
        <Paper sx={{p: 2.5, mb: 2}}>
            <Typography variant="overline" color="text.secondary">
                Customer in HubSpot
            </Typography>
            <TextField
                fullWidth
                size="small"
                placeholder="Name, company, phone or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{mt: 0.5, bgcolor: 'background.default'}}
                slotProps={{
                    input: {endAdornment: loading ? <CircularProgress size={18} /> : undefined},
                }}
            />
            {results.length > 0 && (
                <List dense sx={{mt: 1}}>
                    {results.map((c) => (
                        <ListItemButton
                            key={c.id}
                            onClick={() => setContact(c)}
                            sx={{borderRadius: 2}}
                        >
                            <ListItemText
                                primary={c.name || c.email || c.phone}
                                secondary={[c.company, c.phone, c.email]
                                    .filter(Boolean)
                                    .join(' · ')}
                            />
                        </ListItemButton>
                    ))}
                </List>
            )}
            <Typography color={error ? 'error' : 'text.secondary'} sx={{mt: 1, fontSize: 13}}>
                {error
                    ? 'HubSpot search failed. You can still start the demo.'
                    : query.trim().length >= 2 && !loading && results.length === 0
                      ? 'No contact found. The demo will not be tracked in HubSpot.'
                      : 'Pick the customer so the demo counts in the HubSpot stats.'}
            </Typography>
        </Paper>
    );
};

const liveStatus = (
    viewers: number,
    connections: RTCPeerConnectionState[],
    sharing: boolean
): string => {
    if (viewers === 0) return 'Waiting for the customer to open the link';
    if (!sharing) return 'The customer has the link open. Share a tab to show the screen.';
    if (connections.includes('connected')) {
        return viewers === 1 ? 'The customer is watching' : `${viewers} people are watching`;
    }
    if (connections.includes('failed')) {
        return 'The connection failed. The customer page reconnects by itself. If it keeps failing, ask them to switch between Wi-Fi and mobile data.';
    }
    return 'The customer opened the link. Connecting the picture …';
};

// QR code so the seller can test the customer view on their own phone.
const PhoneTest = ({link}: {link: string}) => {
    const [src, setSrc] = React.useState<string>();
    React.useEffect(() => {
        QRCode.toDataURL(link, {
            margin: 1,
            width: 240,
            color: {dark: '#1C1917', light: '#F7F4ED'},
        }).then(setSrc);
    }, [link]);
    if (!src) return null;
    return (
        <Paper sx={{p: 2.5, mt: 3, display: 'flex', alignItems: 'center', gap: 2}}>
            <img
                src={src}
                alt="QR code for your demo link"
                style={{width: 96, height: 96, borderRadius: 8}}
            />
            <Box>
                <Typography sx={{fontWeight: 600}}>Test on your phone</Typography>
                <Typography color="text.secondary" sx={{fontSize: 14}}>
                    Scan the code to see exactly what the customer sees. Try it on mobile data too.
                </Typography>
            </Box>
        </Paper>
    );
};
