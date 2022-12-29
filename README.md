# ibc-anywhere

<https://ibc.reece.sh>

A simple website interface for transferring tokens with IBC.
The goal is to make it super simple to transfer a token from any network to any other network in which a relayer channel is already setup.

Currently, the only way to do this is with JunoSwap, Osmosis, but that only transfers to a single network. If you want to transfer your ATOM to a network without a DEX interface, you have to do it manually in Keplr / CLI. This removes that requirement.

In the future, add support for IBCMemo

Goal: Make it a few clicks (<4-5) to transfer an IBC packet for ICS-20 (native tokens) to another chain which has a relayer.

---

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.
