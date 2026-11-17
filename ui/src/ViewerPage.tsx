import React from 'react';
import {Box, Button, Typography} from '@mui/material';
import LockIcon from '@mui/icons-material/LockOutlined';
import FullScreenIcon from '@mui/icons-material/Fullscreen';
import {Seller} from './message';
import {UseConfig} from './useConfig';
import {useRoom} from './useRoom';
import {deviceLabel, inAppBrowser, textFor} from './sfText';
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
    const [failures, setFailures] = React.useState(0);
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

    const stateRef = React.useRef<typeof state>(false);
    // The video connection failed: count it and reconnect with a fresh session.
    const onPeerFailed = React.useCallback(() => {
        setFailures((n) => n + 1);
        if (stateRef.current) {
            stateRef.current.ws.close();
        }
    }, []);

    const {state, room} = useRoom(config, {syncURL: false, onClosed, onPeerFailed});
    stateRef.current = state;
    joinRef.current = () =>
        room({type: 'join', payload: {id: seller.slug, username: deviceLabel()}});

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
    const sellerSharing = !!state && state.users.some((u) => u.owner && u.streaming);

    React.useEffect(() => {
        if (live) setFailures(0);
    }, [live]);

    // Keep the phone screen on while the customer watches.
    React.useEffect(() => {
        if (!live || !('wakeLock' in navigator)) return;
        let lock: WakeLockSentinel | undefined;
        const request = () =>
            navigator.wakeLock
                .request('screen')
                .then((l) => (lock = l))
                .catch(() => {});
        request();
        const onVisible = () => document.visibilityState === 'visible' && request();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            lock?.release().catch(() => {});
        };
    }, [live]);

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
                        tapToView={t.tapToView}
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
                ) : failures >= 2 ? (
                    <Message
                        icon={<PulseDot />}
                        title={t.troubleTitle}
                        body={inAppBrowser() ? `${t.inAppHint} ${t.troubleBody}` : t.troubleBody}
                    />
                ) : (
                    <Message
                        icon={<PulseDot />}
                        title={
                            sellerSharing
                                ? t.connecting
                                : state
                                  ? t.pausedTitle(seller.name)
                                  : t.waitingTitle(seller.name)
                        }
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
    tapToView,
}: {
    stream: MediaStream;
    caption: string;
    fullscreen: string;
    tapToView: string;
}) => {
    const video = React.useRef<FullScreenVideo>(null);
    // iOS Low Power Mode and some browsers block autoplay. Then the customer taps once.
    const [blocked, setBlocked] = React.useState(false);

    const play = React.useCallback(() => {
        video.current
            ?.play()
            .then(() => setBlocked(false))
            .catch(() => setBlocked(true));
    }, []);

    React.useEffect(() => {
        if (video.current) {
            video.current.srcObject = stream;
            play();
        }
    }, [stream, play]);

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
                    position: 'relative',
                    alignSelf: 'center',
                    minWidth: 'min(100%, 320px)',
                    minHeight: 180,
                    maxWidth: '100%',
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: '#1C1917',
                    lineHeight: 0,
                }}
            >
                {blocked && (
                    <Box
                        component="button"
                        onClick={play}
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 1,
                            border: 0,
                            cursor: 'pointer',
                            bgcolor: 'rgba(28,25,23,0.55)',
                            color: '#fff',
                            fontSize: 18,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                        }}
                    >
                        ▶ {tapToView}
                    </Box>
                )}
                <video
                    ref={video}
                    autoPlay
                    muted
                    playsInline
                    onPause={() => setBlocked(true)}
                    onPlaying={() => setBlocked(false)}
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
