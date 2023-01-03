<!-- 
    Reece Williams | Dec 2022 | IBCAnywhere
    - Easily transfer a token denom from one chain to another in 5 clicks
    - Abstracts away the complexity of channels for the average user    

    TODO:
    - Only show channels for the to-chain which from-chain has a connection too
    - Dockerize
    - Remove redundant code, such as the open keplr window. Make easy utils
    - Better design. animations?
    - Auto convert IBC denoms to their human readable versions, including exponents
    - Mobile Support
-->
<script lang="ts">
	import type { Window as KeplrWindow } from '@keplr-wallet/types';

	import { Tendermint34Client } from '@cosmjs/tendermint-rpc';
	import type { Coin } from 'cosmjs-types/cosmos/base/v1beta1/coin';
	import { SigningStargateClient, setupIbcExtension, QueryClient } from '@cosmjs/stargate';
	import type { DenomTrace } from '@cosmjs/stargate/node_modules/cosmjs-types/ibc/applications/transfer/v1/transfer';

	import type { OfflineAminoSigner } from '@cosmjs/amino';
	import type { OfflineDirectSigner } from '@cosmjs/proto-signing';

	// use cosmos kit for wallets instead of base keplr
	// https://github.com/cosmology-tech/cosmos-kit/blob/main/packages/example/pages/_app.tsx
	// import { wallets as keplrWallet } from "@cosmos-kit/keplr";	

	import toast, { Toaster } from 'svelte-french-toast';    

	import type { ToastOptions } from 'svelte-french-toast';

	// https://github.com/cosmology-tech/chain-registry/blob/main/packages/assets/src/asset_lists.ts
	// import type { IBCInfo } from '@chain-registry/types';
	import { assets, chains, ibc } from 'chain-registry';

	const toast_style: ToastOptions = {
		position: 'top-right',
		duration: 6000,
		style: 'background: #333; color: #fff; width: 15%; font-size: 1.1rem;'
	};    	

	let chain_input: string; // chain-id
	let to_chain_input: string;
	// let users_balances: Coin[] = [];

	const channel_version: string = 'ics20-1';
	const port_id: string = 'transfer';
	let gas = 300000;

	let ibc_denom: string;
	let ibc_amount: number;

	// if we need to hop channels (ex: osmosis -> stargaze -> umme dex, we will fill this with the channel)
	// Only applies if we send an ibc/ denom, and if said denoms path does not match the to-chain channel # correct?
	let channel_hop: string = ""; 

	let balances: Balance[] = [];

	let from_client: SigningStargateClient | undefined;

	const get_wallet_for_chain = async (
		chain_id: string
	): Promise<OfflineAminoSigner | OfflineDirectSigner> => {
		if (chain_input === undefined) {
			toast.error(`From chain not selected`, toast_style);
			throw new Error('Chain not found');
		}

		// open keplr
		const keplr = window as KeplrWindow;
		if (keplr === undefined) {
			toast.error(`Keplr not found`, toast_style);
			throw new Error('Keplr not found');
		}

		let signer = keplr.getOfflineSignerAuto;
		if (signer === undefined) {
			throw new Error('Keplr not found');
		}

		return signer(chain_id);
	};

	// async function connectToChain
	const connect_wallet_get_balances = async () => {		
		const chain = chains.find((chain) => chain.chain_id === chain_input);
		if (chain === undefined) {
			throw new Error('Chain not found');
		}

		const chain_rpc = chain.apis?.rpc;
		if (chain_rpc === undefined) {
			throw new Error('Chain RPC not found');
		}

		let wallet = await get_wallet_for_chain(chain.chain_id);
		wallet.getAccounts().then((accounts) => {
			console.log('accounts', accounts);
		});

		// try 10 different endpoints max
		for (let i = 0; i < 10; i++) {
			try {
				from_client = await SigningStargateClient.connectWithSigner(chain_rpc[i].address, wallet, {
					prefix: chain.bech32_prefix
				});
				await from_client.getAllBalances((await wallet.getAccounts())[0].address); // ensures it works correctly
				break;
			} catch (error) {
				// cors
				console.log(error);
			}
		}

		if (from_client === undefined) {
			throw new Error('RPC with CORS not found, Client can not be created');
		}

		// get the from balance of addr
		// assign read only from await client.getAllBalances(addr) to user_balancecs Coin[]
		const _bals = await from_client.getAllBalances((await wallet.getAccounts())[0].address);
		// console.log(balances)		
		
		// set the global users_balances to balances		
		balances = []
		for (const b of _bals) {
			// instead get all denoms from the chain in the future so it only requires 1 query
			if (b.denom.includes('ibc/')) {				
				// get the human readable name
				await get_ibc_denom_human_readable(chain_input, b.denom).then((denom_trace) => {
					if (denom_trace !== undefined) {
						balances.push({
							denom: denom_trace.baseDenom,
							amount: b.amount,
							ibc_trace: b.denom, // so we know what we are actually sending
							channel: denom_trace.path,
						});
					}
				}).catch((error) => {
					// its possible you send a denom to another chain which does not have it
					// Ex: Osmosis DEX stars -> Cosmos Hub - breaks since CosmosHub is not relaying with stars
					// So push it as ibc_trace for the Denom name, oh well
					console.log(error);
					balances.push({
						denom: b.denom,
						amount: b.amount,						
					});
				})
			} else {
				balances.push({
					denom: b.denom,
					amount: b.amount,
				});
			}
		}		

		// update it for Svelte
		balances = [...balances]

		console.log(balances);

		// set the id of denoms_to_send to display show
		document.getElementById('denoms_to_send')!.style.display = 'block';

		toast.success(`Keplr Connected to ${chain.pretty_name}`, {
			position: 'top-right',
			duration: 6000,
			style: 'border-radius: 200px; background: #333; color: #fff; width: 12.5%;'
		});
	};

	interface Channel {
		name: string;
		channel_id: string;
		version: string; // ics20-1
		port_id: string; // transfer
	}

	const get_all_channel_pairs = (from_name: string): Channel[] => {
		const matches: Channel[] = [];

		for (const channel of ibc) {
			const c = channel.channels[0]; // why channel 0

			if (channel.chain_1.chain_name === from_name) {
				matches.push({
					name: channel.chain_2.chain_name,
					channel_id: c.chain_1.channel_id,
					port_id: c.chain_1.port_id,
					version: c.version
				});
			} else if (channel.chain_2.chain_name === from_name) {
				matches.push({
					name: channel.chain_1.chain_name,
					channel_id: c.chain_2.channel_id,
					port_id: c.chain_2.port_id,
					version: c.version
				});
			}
		}
		return matches;
	};

	// get_all_channel_pairs("cosmoshub")

	const get_channel = (from_name: string, to_name: string): string => {
		const pairs = get_all_channel_pairs(from_name);

		// todo; add version & port_id in the future

		for (const pair of pairs) {
			if (pair.name === to_name) {
				return pair.channel_id;
			}
		}

		return '';
	};

	const ibc_transfer = async () => {
		// use sendIbcTokens from stargate client
		// const chain_id = "cosmoshub-4"
		const chain = chains.find((chain) => chain.chain_id === chain_input);
		if (chain === undefined) {
			toast.error(`From chain ${chain_input} not found`, toast_style);
			throw new Error('Chain not found');
		}

		// const to_chain_id = "osmosis-1"
		const to_chain = chains.find((chain) => chain.chain_id === to_chain_input);
		if (to_chain === undefined) {
			toast.error(`To chain ${to_chain_input} not found`, toast_style);
			throw new Error('Chain not found');
		}

		let chain_rpc = chain.apis?.rpc;
		let to_chain_rpc = to_chain.apis?.rpc;
		if (chain_rpc === undefined || to_chain_rpc === undefined) {
			throw new Error('Chain RPC not found');
		}

		let wallet = await get_wallet_for_chain(chain.chain_id);
		const addr = (await wallet.getAccounts())[0].address;

		const to_wallet = await get_wallet_for_chain(to_chain.chain_id);
		const to_wallet_addr = (await to_wallet.getAccounts())[0].address;

		// get current time in seconds
		const current_time = Math.floor(Date.now() / 1000);
		const timeout_time = current_time + 300; // 5 minutes

		const channel_id = get_channel(chain.chain_name, to_chain.chain_name); // ex: channel-141
		if (channel_id === undefined || channel_id === '') {
			toast.error(
				`There is no IBC channel for ${chain.chain_name} -> ${to_chain.chain_name} with version ${channel_version} and port_id ${port_id}`,
				toast_style
			);
			throw new Error('Channel not found');
		}

		if (from_client === undefined) {
			throw new Error('from_client not found');
		}

		// ensurer ibc_denom ibc_amount is not > balances
		for (const balance of balances) {
			if (balance.denom === ibc_denom) {
				if (Number(balance.amount) < ibc_amount) {
					toast.error(`You do not have ${ibc_amount} ${ibc_denom}`, toast_style);
					throw new Error('Not enough balance');
				}
			}
		}

		toast('Waiting for Keplr to sign IBC transfer', { ...toast_style, icon: '⏳' });

		from_client
			.sendIbcTokens(
				addr,
				to_wallet_addr,
				{ denom: ibc_denom, amount: ibc_amount.toString() },
				port_id,
				channel_id,
				undefined,
				timeout_time,
				{ amount: [], gas: gas.toString() },
				`IBC-Anywhere by Reece | from ${chain.pretty_name} to ${to_chain.pretty_name}`
			)
			.then((tx) => {
				console.log(tx);
				if (tx.code == 0) {
					toast.success(
						`IBC transfer from ${chain.pretty_name} successful\n\nTxHash: ${tx.transactionHash}`,
						toast_style
					);
				}				
			})			
			.catch((err) => {
				toast.error(`${err}`, toast_style);
			});        
	};

	// If a user presses to 'Hop Transfer' then we get the channel_id from the denom, send it to that from current chain, and then make another popup to send to said chain
	// origin_channel_id is from the denom itself when we queried it to send it back to origin
	// final_hop_chain is the actual chain they wanted to send it to, this time we do it natively tho
	const ibc_transfer_channel_hop = async (origin_chain: string, origin_channel_id: string, final_hop_chain: string, call_number: number = 0) => {

		if(call_number >= 2) {
			toast.error(`Too Many Hops (>=2)`, toast_style);
			throw new Error('Too many hops');
		}

		// TODO: fix this logic tomorrow not tested and no way it is right.

		// use sendIbcTokens from stargate client
		// const chain_id = "cosmoshub-4"
		const chain = chains.find((chain) => chain.chain_id === origin_chain);
		if (chain === undefined) {
			toast.error(`From chain ${chain_input} not found`, toast_style);
			throw new Error('Chain not found');
		}

		// const to_chain_id = "osmosis-1"
		const to_chain = chains.find((chain) => chain.chain_id === final_hop_chain);
		if (to_chain === undefined) {
			toast.error(`Middlware chain ${temp_to_chain} not found`, toast_style);
			throw new Error('Chain not found');
		}

		let chain_rpc = chain.apis?.rpc;
		let to_chain_rpc = to_chain.apis?.rpc;
		if (chain_rpc === undefined || to_chain_rpc === undefined) {
			throw new Error('Chain RPC not found');
		}

		let wallet = await get_wallet_for_chain(chain.chain_id);
		const addr = (await wallet.getAccounts())[0].address;

		const to_wallet = await get_wallet_for_chain(to_chain.chain_id);
		const to_wallet_addr = (await to_wallet.getAccounts())[0].address;

		// get current time in seconds
		const current_time = Math.floor(Date.now() / 1000);
		const timeout_time = current_time + 300; // 5 minutes
				
		if (from_client === undefined) {
			throw new Error('from_client not found');
		}

		// ensurer ibc_denom ibc_amount is not > balances
		for (const balance of balances) {
			if (balance.denom === ibc_denom) {
				if (Number(balance.amount) < ibc_amount) {
					toast.error(`You do not have ${ibc_amount} ${ibc_denom}`, toast_style);
					throw new Error('Not enough balance');
				}
			}
		}

		toast('Waiting for Keplr to sign IBC transfer', { ...toast_style, icon: '⏳' });

		from_client
			.sendIbcTokens(
				addr,
				to_wallet_addr,
				{ denom: ibc_denom, amount: ibc_amount.toString() },
				port_id,
				origin_channel_id,
				undefined,
				timeout_time,
				{ amount: [], gas: gas.toString() },
				`IBC-Anywhere by Reece | from ${chain.pretty_name} to ${to_chain.pretty_name}`
			)
			.then((tx) => {
				console.log(tx);
				if (tx.code == 0) {
					toast.success(
						`Middlware IBC transfer from ${chain.pretty_name} successful\n\nTxHash: ${tx.transactionHash}`,
						toast_style
					);					
				}				
			})			
			.catch((err) => {
				toast.error(`${err}`, toast_style);
			});      
		
		if(call_number == 1) {

			// now we call again to send to the actual chain they wanted, where to get this to_chain data from?
			// pretty sure this logic is way wrong, but yea
			const channel_id = get_channel(final_hop_chain, to_chain.chain_name); // ex: channel-141
			if (channel_id === undefined || channel_id === '') {
				toast.error(
					`idk it erroed`,
				);
				throw new Error('Channel not found');
			}		



			ibc_transfer_channel_hop(final_hop_chain, channel_id, call_number+1);

		}


	};

	const get_ibc_denom_human_readable = async (chain_id: string, ibc_trace: string): Promise<DenomTrace | undefined> => {		

		if (ibc_trace !== undefined && (!ibc_trace.startsWith('ibc/'))) {
			return undefined;
		}

		// TODO: save this client in an object and/or iterate over failed client created in the chain_rpc array
		// create a stargate query client, query the ibc-transfer denom-trace, and return the human readable name
		const chain = chains.find((chain) => chain.chain_id === chain_id);
		if (chain === undefined) {
			toast.error(`Chain ${chain_id} not found`, toast_style);
			throw new Error('Chain not found');
		}

		let chain_rpc = chain.apis?.rpc;
		if (chain_rpc === undefined) {
			throw new Error('Chain RPC not found');
		}

		const tm_client = await Tendermint34Client.connect(chain_rpc[0].address);		
		const queryClient = QueryClient.withExtensions(tm_client);
		let ext = setupIbcExtension(queryClient);

		// maybe get all denom traces in the future instead of a single one per, are they the same SHA hash (trace)?
		const data = await ext.ibc.transfer.denomTrace(ibc_trace)
		// .catch((err) => {
		// 	console.log(err);
		// 	toast.error(`Error getting denom trace for ${ibc_trace} on chain ${chain_input}`, toast_style);
		// 	return undefined;
		// })

		console.log(data);

		return data?.denomTrace;
	}

	// this would be in place of connect wallet

	interface Balance {
		denom: string; // human readable (ex: uosmo)
		amount: string;
		ibc_trace?: string; // ibc/
		channel?: string;
	}


</script>

<Toaster />

<!-- datalist of users_balances -->
<datalist id="denoms">
	{#each balances as balance}
		<option value={balance.denom}>{balance.denom}</option>
	{/each}
</datalist>

<!-- datalist of denoms in humand reacable format -->
<datalist id="denoms_human_readable">
	{#each balances as denom}
		<option value={denom.denom}>{denom.denom}</option>
	{/each}
</datalist>

<!-- chain names & match with chain_id value -->
<datalist id="chain_names">
	{#each chains as chain}
		<option value={chain.chain_id}>{chain.pretty_name}</option>
	{/each}
</datalist>

<!-- main website code -->
<h1>IBC Anywhere</h1>
<p>Easily IBC token transfer from and to any chain in 5 clicks (Desktop only right now) (<a href="https://twitter.com/Reecepbcups_" target="noreferrer">Get Support</a>)</p>
<p><b>Includes Ledger Support (as of Jan 1st)</b></p>
<p><a href="https://github.com/Reecepbcups/ibc-anywhere-webapp" target="noreferrer">Open Source</a></p>

<center>
	<div id="from_chain" class="div_center">
		<h3>From Chain</h3>
		<p>Type the chain you want and select in in the dropdown box</p>
		<input
			id="chain_input"
			type="text"
			placeholder="from chain-id"
			list="chain_names"
			bind:value={chain_input}
		/>
		<br />

		<br />
		<!-- Connects the wallet to the current chain, then we will show the user more information. -->
		<input type="submit" value="Connect Wallet" on:click={() => connect_wallet_get_balances()} />
	</div>

	<div id="denoms_to_send" style="display: none;" class="div_center">
		<!-- li of users_balances -->
		<h3>balances</h3>
		<ul>
			{#each balances as b}
				<!-- if denom starts with ibc/, we need to decode the ibc-trace -->				

				<!-- await a query to get_ibc_denom_human_readable -->
				{#await get_ibc_denom_human_readable(chain_input, b.denom)}
					<p>loading denoms....</p>
				{:then denom_data}
					{#if denom_data !== undefined}
						<!-- We need to save this somewhere so we can channel hop over to .path then to the new designation chain. But ensure we don't hop if there is no connect to said chain -->
						<li>{b.amount} {denom_data.baseDenom} ({denom_data.path})</li>
						{:else}
						<li>{b.amount} {b.denom}</li>
						{/if}
					{:catch error}
						<!-- <p style="color: red">{error.message}</p> -->
						<li>{b.amount} {b.denom}</li>
				{/await}
			{/each}
		</ul>

		<input type="number" placeholder="Amount" bind:value={ibc_amount} />		

		<select bind:value={ibc_denom}>
			<option value="" disabled selected>Select a Denom</option>
			
			{#each balances as balance, i}				
				{#if balance.channel === undefined}
					<option value={balance.denom}>{balance.denom}</option>				
				{:else}
					<option value={balance.ibc_trace}>{balance.denom} ({balance.channel})</option>
				{/if}				
			{/each}

		</select>

		<!-- select iterate over  -->
		<h4>To Chain</h4>
		<input type="text" placeholder="to chain-id" list="chain_names" bind:value={to_chain_input} />

		<!-- Sends the token directly to the other chain reguardless of its metadata (ex: if its from osmosis) -->
		<input type="submit" value="Direct Send" on:click={() => ibc_transfer()} />

		<!-- if ibc_denom is set, then show a button here which says "Proper Send" -->
		{#if ibc_denom !== undefined}
			<input type="submit" value="Proper Send" on:click={() => console.log(`Routing to XYZ`)} />
		{/if}

	</div>

	<div id="successful_txs" style="display: none;" class="div_center">
		<ul id="past_txs_ul" />
	</div>
</center>

<style>

	* {
		font-family: 'Nunito Sans', sans-serif;
	}

	:global(body) {
		background-color: #ffffff;
	}

	h1,
	h3,
	p {
		text-align: center;
		color: black;
	}

	.div_center {
		border: 1px solid black;
		padding: 10px;
		margin: 10px;
		max-width: 50%;
		float: none !important;
		text-align: center;
	}

	ul {
		list-style: none;
	}

	li {
		margin: 10px;
	}	

	input[type='submit'] {
		background-color: #5e72e4;
		color: white;
		padding: 16px 32px;
		text-align: center;
		text-decoration: none;
		display: inline-block;
		font-size: 16px;
		margin: 4px 2px;
		cursor: pointer;
		border-radius: 8px;
	}

	input[type='text'],
	input[type='number'],
	select {
		width: 25%;
		padding: 12px 20px;
		margin: 8px 0;
		display: inline-block;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-sizing: border-box;
	}
</style>
