import {RoomManage} from './RoomManage';
import {useRoom} from './useRoom';
import {Room} from './Room';
import {UseConfig, useConfig, viewSellerSlug} from './useConfig';
import {ViewerPage} from './ViewerPage';
import {SellerApp} from './SellerApp';
import {NotFoundLink} from './NotFoundLink';

export const Router = () => {
    const config = useConfig();

    if (config.loading) {
        // show spinner
        return null;
    }
    if (viewSellerSlug()) {
        return config.viewSeller ? (
            <ViewerPage config={config} seller={config.viewSeller} />
        ) : (
            <NotFoundLink />
        );
    }
    if (config.loggedIn && config.seller) {
        return <SellerApp config={config} seller={config.seller} />;
    }
    return <RouterLoadedConfig config={config} />;
};

const RouterLoadedConfig = ({config}: {config: UseConfig}) => {
    const {room, state, ...other} = useRoom(config);

    if (state) {
        return <Room state={state} {...other} />;
    }

    return <RoomManage room={room} config={config} />;
};
