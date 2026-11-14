import React from 'react';
import {Box, Button, Typography} from '@mui/material';
import LockIcon from '@mui/icons-material/LockOutlined';
import FullScreenIcon from '@mui/icons-material/Fullscreen';
import {Seller} from './message';
import {UseConfig} from './useConfig';
import {useRoom} from './useRoom';
import {textFor} from './sfText';
import {BrandHeader, LivePill, PulseDot} from './Brand';

type Phase = 'waiting' | 'ended' | 'expired';

const RETRY_MS = 2000;
// Stop polling an unused link after 20 minutes.
const GIVE_UP_MS = 20 * 60 * 1000;
// Server close reason when the seller leaves (ws.CloseOwnerLeft).
const OWNER_LEFT = 'Owner Left';

type FullScreenVideo = HTMLVideoElement & {webkitEnterFullscreen?: () => void};

export const ViewerPage = ({config, seller}: {config: UseConfig; seller: Seller}) => {
    const t = textFor(seller);
    const [phase, setPhase] = React.useState<Phase>('waiting');
    const startedAt = React.useRef(Date.now());
    const retryTimer = React.useRef(0);
    const joinRef = React.useRef<() => void>(() => {});

    const onClosed = React.useCallback((reason: string, joined: boolean) => {
        if (joined && reason === OWNER_LEFT) {
            setPhase('ended');
            return;
        }
        if (Date.now() - startedAt.current > GIVE_UP_MS) {
            setPhase('expired');
            return;
        }
        // The seller has not started yet, or the network dropped: try again.
        retryTimer.current = window.setTimeout(() => joinRef.current(), RETRY_MS);
    }, []);

    const {state, room} = useRoom(config, {syncURL: false, onClosed});
    joinRef.current = () => room({type: 'join', payload: {id: seller.slug}});

    React.useEffect(() => {
        joinRef.current();
        return () => clearTimeout(retryTimer.current);
    }, []);

    const restart = () => {
        startedAt.current = Date.now();
        setPhase('waiting');
        joinRef.current();
    };

    const stream = state ? state.clientStreams[0]?.stream : undefined;
    const live = !!stream && phase === 'waiting';

    return (
        <Box
            sx={{
                minHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.default',
            }}
        >
            <BrandHeader right={live ? <LivePill label={t.live} /> : undefined} />
            <Box
                component="main"
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: {xs: 1.5, sm: 3},
                    pb: 2,
                }}
            >
                {live ? (
                    <LiveVideo
                        stream={stream}
                        caption={t.sharing(seller.name)}
                        fullscreen={t.fullscreen}
                    />
                ) : phase === 'ended' ? (
                    <Message title={t.endedTitle} body={t.endedBody}>
                        <Button variant="outlined" color="secondary" href="https://scaleframes.com">
                            {t.visit}
                        </Button>
                    </Message>
                ) : phase === 'expired' ? (
                    <Message title={t.expiredTitle} body={t.expiredBody}>
                        <Button variant="contained" onClick={restart}>
                            {t.retry}
                        </Button>
                    </Message>
                ) : (
                    <Message
                        icon={<PulseDot />}
                        title={state ? t.pausedTitle(seller.name) : t.waitingTitle(seller.name)}
                        body={t.waitingBody}
                    />
                )}
            </Box>
            <Box
                component="footer"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.75,
                    py: 1.5,
                    color: 'text.secondary',
                    fontSize: 13,
                }}
            >
                <LockIcon sx={{fontSize: 15}} /> {t.secure} · demo.scaleframes.com
            </Box>
        </Box>
    );
};

const Message = ({
    icon,
    title,
    body,
    children,
}: React.PropsWithChildren<{icon?: React.ReactNode; title: string; body: string}>) => (
    <Box sx={{textAlign: 'center', maxWidth: 440, py: 6}}>
        {icon && <Box sx={{mb: 3, display: 'flex', justifyContent: 'center'}}>{icon}</Box>}
        <Typography variant="h5" component="h1" sx={{mb: 1.5, fontSize: {xs: 24, sm: 28}}}>
            {title}
        </Typography>
        <Typography color="text.secondary" sx={{mb: children ? 3 : 0}}>
            {body}
        </Typography>
        {children}
    </Box>
);

const LiveVideo = ({
    stream,
    caption,
    fullscreen,
}: {
    stream: MediaStream;
    caption: string;
    fullscreen: string;
}) => {
    const video = React.useRef<FullScreenVideo>(null);

    React.useEffect(() => {
        if (video.current) {
            video.current.srcObject = stream;
            video.current.play().catch((err) => console.log('Could not play video', err));
        }
    }, [stream]);

    const goFullscreen = () => {
        const el = video.current;
        if (el?.requestFullscreen) {
            el.requestFullscreen().catch(() => el.webkitEnterFullscreen?.());
        } else {
            el?.webkitEnterFullscreen?.();
        }
    };

    return (
        <Box
            sx={{width: '100%', maxWidth: 1400, display: 'flex', flexDirection: 'column', gap: 1.5}}
        >
            <Box
                sx={{
                    alignSelf: 'center',
                    maxWidth: '100%',
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: '#1C1917',
                    lineHeight: 0,
                }}
            >
                <video
                    ref={video}
                    autoPlay
                    muted
                    playsInline
                    onDoubleClick={goFullscreen}
                    style={{
                        display: 'block',
                        maxWidth: '100%',
                        width: 'auto',
                        height: 'auto',
                        maxHeight: 'calc(100dvh - 180px)',
                    }}
                />
            </Box>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                }}
            >
                <Typography sx={{fontWeight: 500}}>{caption}</Typography>
                <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<FullScreenIcon />}
                    onClick={goFullscreen}
                >
                    {fullscreen}
                </Button>
            </Box>
        </Box>
    );
};
