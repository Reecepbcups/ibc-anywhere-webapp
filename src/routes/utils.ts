// https://github.com/cosmology-tech/chain-registry/blob/main/packages/utils/src/utils.ts

// TODO: Future, grab an asset ibc/tracedenom and convert to be human readable

import type { AssetList, IBCInfo } from '@chain-registry/types';

export const getWasmChannel = (info: IBCInfo) => {
    return info.channels.find(
        (channel) =>
            (channel.chain_1.port_id.startsWith('wasm.') &&
                channel.chain_2.port_id === 'transfer') ||
            (channel.chain_1.port_id === 'transfer' &&
                channel.chain_2.port_id.startsWith('wasm'))
    );
};

const findInfo = (ibc: IBCInfo[], to: string, from: string) => {
    ibc.find((i) => i.chain_1.chain_name === from && i.chain_2.chain_name === to);
}

export const getIbcInfo = (
    ibc: IBCInfo[],
    chain: string,
    counterparty: string
): IBCInfo | void => {
    // return (
    //     findInfo(ibc, chain, counterparty) || findInfo(ibc, counterparty, chain)
    // );

    const v1 = findInfo(ibc, chain, counterparty);
    if (v1 !== undefined) {
        return v1;
    }
    const v2 = findInfo(ibc, counterparty, chain);
    if (v2 !== undefined) {
        return v2;
    }

    return undefined;
};

export const getTransferChannel = (info: IBCInfo) => {
    return info.channels.find(
        (channel) =>
            channel.chain_1.port_id === 'transfer' &&
            channel.chain_2.port_id === 'transfer'
    );
};

export const getIbcAssetPath = (
    ibc: IBCInfo[],
    chain: string,
    counterparty: string,
    assets: AssetList[],
    base: string
): any  => {
    const ibcInfo = getIbcInfo(ibc, chain, counterparty);
    if (!ibcInfo) {
        return [];
    }

    const channel = base.startsWith('cw20:')
        ? getWasmChannel(ibcInfo)
        : getTransferChannel(ibcInfo);

    if (!channel) {
        return [];
    }
    let channelInfo;
    if (ibcInfo.chain_1.chain_name === chain) {
        channelInfo = channel.chain_1;
    } else {
        channelInfo = channel.chain_2;
    }

    const memo = [channelInfo];

    const assetList = assets.find(
        ({ chain_name }) => chain_name === counterparty
    );
    if (!assetList) {
        return memo;
    }
    const asset = assetList.assets.find((asset) => asset.base === base);
    if (!asset) {
        console.log(`no ${base} found in ${counterparty}`);
        return memo;
    }

    const traces =
        asset.traces?.filter?.((trace) => {
            return trace.type === 'ibc' || trace.type === 'ibc-cw20';
        }) ?? [];

    if (!traces.length) {
        return memo;
    }

    if (traces.length > 1) {
        throw new Error('contact maintainers: multi-hop not yet supported');
    }

    const [trace] = traces;
    return [
        ...memo,
        ...getIbcAssetPath(
            ibc,
            counterparty,
            trace.counterparty.chain_name,
            assets,
            trace.counterparty.base_denom
            // base
        )
    ];
};