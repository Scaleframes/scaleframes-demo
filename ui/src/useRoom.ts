import {useSnackbar} from 'notistack';
import React from 'react';

import {
    ICEServer,
    IncomingMessage,
    JoinRoom,
    OutgoingMessage,
    RoomCreate,
    RoomInfo,
    UIConfig,
} from './message';
import {loadSettings, resolveCodecPlaceholder} from './settings';
import {urlWithSlash} from './url';
import {authModeToRoomMode} from './useConfig';
import {getFromURL, useRoomID} from './useRoomID';

export type RoomState = false | ConnectedRoom;
export type ConnectedRoom = {
    ws: WebSocket;
    hostStream?: MediaStream;
    clientStreams: ClientStream[];
    // Connection state of each viewer session, as the host sees it.
    hostConnections?: Record<string, RTCPeerConnectionState>;
} & RoomInfo;

interface ClientStream {
    id: string;
    peer_id: string;
    stream: MediaStream;
}

export interface UseRoom {
    state: RoomState;
    room: FCreateRoom;
    share: (picked?: MediaStream) => void;
    setName: (name: string) => void;
    stopShare: () => void;
}

// A candidate can arrive before the remote description is set. addIceCandidate then fails and
// the candidate is lost, which can be the only working (relay) path on mobile networks.
const pendingIce: Record<string, RTCIceCandidateInit[]> = {};
const addIce = (
    sid: string,
    peer: RTCPeerConnection | undefined,
    candidate: RTCIceCandidateInit
) => {
    if (!peer || !peer.remoteDescription) {
        (pendingIce[sid] ??= []).push(candidate);
        return;
    }
    peer.addIceCandidate(candidate).catch((err) => console.log('addIceCandidate', err));
};
const flushIce = (sid: string, peer: RTCPeerConnection) => {
    (pendingIce[sid] ?? []).forEach((c) =>
        peer.addIceCandidate(c).catch((err) => console.log('addIceCandidate', err))
    );
    delete pendingIce[sid];
};

const relayConfig: Partial<RTCConfiguration> =
    window.location.search.indexOf('forceTurn=true') !== -1 ? {iceTransportPolicy: 'relay'} : {};

const hostSession = async ({
    sid,
    ice,
    send,
    done,
    stream,
    onState,
}: {
    sid: string;
    ice: ICEServer[];
    send: (e: OutgoingMessage) => void;
    done: () => void;
    stream: MediaStream;
    onState: (s: RTCPeerConnectionState) => void;
}): Promise<RTCPeerConnection> => {
    const peer = new RTCPeerConnection({...relayConfig, iceServers: ice});
    peer.onicecandidate = (event) => {
        if (!event.candidate) {
            return;
        }
        send({type: 'hostice', payload: {sid: sid, value: event.candidate}});
    };

    peer.onconnectionstatechange = (event) => {
        console.log('host change', event);
        onState(peer.connectionState);
        if (peer.connectionState === 'closed' || peer.connectionState === 'failed') {
            peer.close();
            done();
        }
    };

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const preferCodec = resolveCodecPlaceholder(loadSettings().preferCodec);
    if (preferCodec) {
        const transceiver = peer
            .getTransceivers()
            .find((t) => t.sender && t.sender.track === stream.getVideoTracks()[0]);

        if (!!transceiver && 'setCodecPreferences' in transceiver) {
            const exactMatch: RTCRtpCodec[] = [];
            const mimeMatch: RTCRtpCodec[] = [];
            const others: RTCRtpCodec[] = [];

            RTCRtpReceiver.getCapabilities('video')?.codecs.forEach((codec) => {
                if (codec.mimeType === preferCodec.mimeType) {
                    if (codec.sdpFmtpLine === preferCodec.sdpFmtpLine) {
                        exactMatch.push(codec);
                    } else {
                        mimeMatch.push(codec);
                    }
                } else {
                    others.push(codec);
                }
            });

            const sortedCodecs = [...exactMatch, ...mimeMatch, ...others];

            console.log('Setting codec preferences', sortedCodecs);
            transceiver.setCodecPreferences(sortedCodecs);
        }
    }

    const hostOffer = await peer.createOffer({offerToReceiveVideo: true});
    await peer.setLocalDescription(hostOffer);
    send({type: 'hostoffer', payload: {value: hostOffer, sid: sid}});

    return peer;
};

const clientSession = async ({
    sid,
    ice,
    send,
    done,
    onTrack,
    onFailed,
}: {
    sid: string;
    ice: ICEServer[];
    send: (e: OutgoingMessage) => void;
    onTrack: (s: MediaStream) => void;
    done: () => void;
    onFailed?: () => void;
}): Promise<RTCPeerConnection> => {
    console.log('ice', ice);
    const peer = new RTCPeerConnection({...relayConfig, iceServers: ice});
    peer.onicecandidate = (event) => {
        if (!event.candidate) {
            return;
        }
        send({type: 'clientice', payload: {sid: sid, value: event.candidate}});
    };
    peer.onconnectionstatechange = (event) => {
        console.log('client change', event);
        const failed = peer.connectionState === 'failed';
        if (failed || peer.connectionState === 'closed') {
            peer.close();
            done();
            if (failed) {
                onFailed?.();
            }
        }
    };

    let notified = false;
    const stream = new MediaStream();
    peer.ontrack = (event) => {
        stream.addTrack(event.track);
        if (!notified) {
            notified = true;
            onTrack(stream);
        }
    };

    return peer;
};

// Resolves true when the room was created or joined.
export type FCreateRoom = (room: RoomCreate | JoinRoom) => Promise<boolean>;

export interface UseRoomOptions {
    // Called instead of the error snackbar when the connection closes.
    onClosed?: (reason: string, joined: boolean) => void;
    // false: do not write ?room= into the URL and do not join from the URL on load.
    syncURL?: boolean;
    // Called when a viewer connection fails, so the caller can reconnect.
    onPeerFailed?: () => void;
}

export const useRoom = (
    config: UIConfig,
    {onClosed, syncURL = true, onPeerFailed}: UseRoomOptions = {}
): UseRoom => {
    const [roomID, setRoomIDInURL] = useRoomID();
    const setRoomID = syncURL ? setRoomIDInURL : () => {};
    const {enqueueSnackbar} = useSnackbar();
    const conn = React.useRef<WebSocket | undefined>(undefined);
    const host = React.useRef<Record<string, RTCPeerConnection>>({});
    const client = React.useRef<Record<string, RTCPeerConnection>>({});
    const stream = React.useRef<MediaStream>(undefined);

    const [state, setState] = React.useState<RoomState>(false);

    const room: FCreateRoom = React.useCallback(
        (create) => {
            return new Promise<boolean>((resolve) => {
                const ws = (conn.current = new WebSocket(
                    urlWithSlash.replace('http', 'ws') + 'stream'
                ));
                const send = (message: OutgoingMessage) => {
                    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
                };
                let first = true;
                ws.onmessage = (data) => {
                    const event: IncomingMessage = JSON.parse(data.data);
                    if (first) {
                        first = false;
                        if (event.type === 'room') {
                            resolve(true);
                            setState({ws, ...event.payload, clientStreams: []});
                            setRoomID(event.payload.id);
                        } else {
                            resolve(false);
                            enqueueSnackbar('Unknown Event: ' + event.type, {variant: 'error'});
                            ws.close(1000, 'received unknown event');
                        }
                        return;
                    }

                    switch (event.type) {
                        case 'room':
                            setState((current) =>
                                current ? {...current, ...event.payload} : current
                            );
                            return;
                        case 'hostsession':
                            if (!stream.current) {
                                return;
                            }
                            hostSession({
                                sid: event.payload.id,
                                stream: stream.current!,
                                ice: event.payload.iceServers,
                                send,
                                done: () => delete host.current[event.payload.id],
                                onState: (s) =>
                                    setState((current) =>
                                        current
                                            ? {
                                                  ...current,
                                                  hostConnections: {
                                                      ...current.hostConnections,
                                                      [event.payload.id]: s,
                                                  },
                                              }
                                            : current
                                    ),
                            }).then((peer) => {
                                host.current[event.payload.id] = peer;
                            });
                            return;
                        case 'clientsession':
                            const {id: sid, peer} = event.payload;
                            clientSession({
                                sid,
                                send,
                                ice: event.payload.iceServers,
                                onFailed: onPeerFailed,
                                done: () => {
                                    delete client.current[sid];
                                    setState((current) =>
                                        current
                                            ? {
                                                  ...current,
                                                  clientStreams: current.clientStreams.filter(
                                                      ({id}) => id !== sid
                                                  ),
                                              }
                                            : current
                                    );
                                },
                                onTrack: (stream) =>
                                    setState((current) =>
                                        current
                                            ? {
                                                  ...current,
                                                  clientStreams: [
                                                      ...current.clientStreams,
                                                      {
                                                          id: sid,
                                                          stream,
                                                          peer_id: peer,
                                                      },
                                                  ],
                                              }
                                            : current
                                    ),
                            }).then((peer) => (client.current[event.payload.id] = peer));
                            return;
                        case 'clientice':
                            addIce(
                                event.payload.sid,
                                host.current[event.payload.sid],
                                event.payload.value
                            );
                            return;
                        case 'clientanswer': {
                            const hostPeer = host.current[event.payload.sid];
                            hostPeer
                                ?.setRemoteDescription(event.payload.value)
                                .then(() => flushIce(event.payload.sid, hostPeer));
                            return;
                        }
                        case 'hostoffer':
                            (async () => {
                                await client.current[event.payload.sid]?.setRemoteDescription(
                                    event.payload.value
                                );
                                if (client.current[event.payload.sid]) {
                                    flushIce(event.payload.sid, client.current[event.payload.sid]);
                                }
                                const answer =
                                    await client.current[event.payload.sid]?.createAnswer();
                                await client.current[event.payload.sid]?.setLocalDescription(
                                    answer
                                );
                                send({
                                    type: 'clientanswer',
                                    payload: {sid: event.payload.sid, value: answer},
                                });
                            })();
                            return;
                        case 'hostice':
                            addIce(
                                event.payload.sid,
                                client.current[event.payload.sid],
                                event.payload.value
                            );
                            return;
                        case 'endshare':
                            client.current[event.payload]?.close();
                            host.current[event.payload]?.close();
                            setState((current) =>
                                current
                                    ? {
                                          ...current,
                                          clientStreams: current.clientStreams.filter(
                                              ({id}) => id !== event.payload
                                          ),
                                      }
                                    : current
                            );
                    }
                };
                ws.onclose = (event) => {
                    const joined = !first;
                    if (first) {
                        resolve(false);
                        first = false;
                    }
                    if (onClosed) {
                        onClosed(event.reason, joined);
                    } else {
                        enqueueSnackbar(event.reason, {variant: 'error', persist: true});
                    }
                    setState(false);
                };
                ws.onerror = (err) => {
                    if (onClosed) {
                        // onclose follows every error and reports it.
                        return;
                    }
                    if (first) {
                        resolve(false);
                        first = false;
                    }
                    enqueueSnackbar(err?.toString(), {variant: 'error', persist: true});
                    setState(false);
                };
                ws.onopen = () => {
                    create.payload.username = loadSettings().name || create.payload.username;
                    send(create);
                };
            });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [setState, enqueueSnackbar, syncURL, onClosed, onPeerFailed]
    );

    const share = async (picked?: MediaStream) => {
        if (picked) {
            stream.current = picked;
            startStream();
            return;
        }
        if (!navigator.mediaDevices) {
            enqueueSnackbar(
                'Could not start presentation. Are you using https? (mediaDevices undefined)',
                {variant: 'error', persist: true}
            );
            return;
        }
        if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
            enqueueSnackbar(
                `Could not start presentation. Your browser likely doesn't support screensharing. (mediaDevices.getDeviceMedia ${typeof navigator.mediaDevices.getDisplayMedia})`,
                {variant: 'error', persist: true}
            );
            return;
        }
        try {
            const {framerate, width, height} = loadSettings();
            stream.current = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: framerate,
                    ...(width > 0 && {width: {max: width}}),
                    ...(height > 0 && {height: {max: height}}),
                },
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    // https://medium.com/@trystonperry/why-is-getdisplaymedias-audio-quality-so-bad-b49ba9cfaa83
                    // @ts-expect-error
                    googAutoGainControl: false,
                },
            });
        } catch (e) {
            console.log('Could not getDisplayMedia', e);
            enqueueSnackbar(`Could not start presentation. (getDisplayMedia error). ${e}`, {
                variant: 'error',
                persist: true,
            });
            return;
        }

        startStream();
    };

    const startStream = () => {
        stream.current?.getVideoTracks()[0].addEventListener('ended', () => stopShare());
        setState((current) => (current ? {...current, hostStream: stream.current} : current));

        conn.current?.send(JSON.stringify({type: 'share', payload: {}}));
    };

    const stopShare = async () => {
        Object.values(host.current).forEach((peer) => {
            peer.close();
        });
        host.current = {};
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = undefined;
        conn.current?.send(JSON.stringify({type: 'stopshare', payload: {}}));
        setState((current) => (current ? {...current, hostStream: undefined} : current));
    };

    const setName = (name: string): void => {
        conn.current?.send(JSON.stringify({type: 'name', payload: {username: name}}));
    };

    React.useEffect(() => {
        if (roomID && syncURL) {
            const create = getFromURL('create') === 'true';
            if (create) {
                const closeOnOwnerLeaveString = getFromURL('closeOnOwnerLeave');
                const closeOnOwnerLeave =
                    closeOnOwnerLeaveString === undefined
                        ? config.closeRoomWhenOwnerLeaves
                        : closeOnOwnerLeaveString === 'true';
                room({
                    type: 'create',
                    payload: {
                        joinIfExist: true,
                        closeOnOwnerLeave,
                        id: roomID,
                        mode: authModeToRoomMode(config.authMode, config.loggedIn),
                    },
                });
            } else {
                room({type: 'join', payload: {id: roomID}});
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {state, room, share, stopShare, setName};
};
