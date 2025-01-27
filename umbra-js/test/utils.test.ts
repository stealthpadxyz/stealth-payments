import { ethers } from 'hardhat';
import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { expect } from 'chai';
import * as utils from '../src/utils/utils';
import type { EthersProvider } from '../src/types';
import { expectRejection } from './utils';
import { Event } from '../src/ethers';

const ethersProvider = ethers.provider;

const INFURA_ID = <string>process.env.INFURA_ID;
if (!INFURA_ID) throw new Error('Please set your INFURA_ID in a .env file');

// Public key and address corresponding to stratus4.eth
const publicKey = '0x04458465db23fe07d148c8c9078d8b67497998a66f4f2aa479973a9cbaaf8b5a96e6ba166a389b8f794b68010849b64b91343e72c7fa4cfcc178607c4b1d4870ed'; // prettier-ignore
const address = '0x3f3c8dB1487469E8091cb210e9cf16D0Af0dE6FC';

// Public keys generated from a signature by the address stratus4.eth resolves to
const pubKeysWallet = { spendingPublicKey: publicKey, viewingPublicKey: publicKey };
const pubKeysUmbra = {
  spendingPublicKey: '0x04620950ddc4dd4352e91ed71ef87c1aba0d76296cb8d5b48996e31e4062c76c6e38b0d8b4c116d645604051c5c6255179538741e8d01595703c245dd6d9b6f7c3', // prettier-ignore
  viewingPublicKey: '0x04c9b42559000738090391904fe6b91327875df36ac0b294b075c834c056bdeaf25d067694830cfe143784d52d1b0ef637d535fdc6bfc687b0ccbdbf2b00a282dc', // prettier-ignore
};

// Define public key that is not on the curve. This point was generated from a valid public key ending in
// `83b3` and we took this off the curve by changing the final digits to `83b4`
const badPublicKey = '0x04059f2fa86c55b95a8db142a6a5490c43e242d03ed8c0bd58437a98709dc9e18b3bddafce903ea49a44b78d57626448c83f8649d3ec4e7c72d8777823f49583b4'; // prettier-ignore

describe('Utilities', () => {
  describe('Public key recovery', () => {
    it('recovers public keys from type 0 transaction', async () => {
      const hash = '0xc25e91d4435528e04478036e64c68a70979086eee63b47a2c277bdb00c071d21';
      const tx = await ethersProvider.getTransaction(hash);
      expect(tx.type).to.equal(0);
      expect(await utils.recoverPublicKeyFromTransaction(hash, ethersProvider)).to.equal(publicKey);
    });

    // Sending a type 1 transaction is a pain because they are rarely used, and finding an existing
    // one is tedious. We probably should have tests for this, but the `recoverPublicKeyFromTransaction`
    // method has logic to validate it's result: if the pubkey it recovered doesn't derive to the
    // sender of the tx, it will throw an error. So even though we don't have tests, user's can't
    // lose funds from that method being faulty. Additionally, this test only broke since Rinkeby
    // is deprecated, nothing changed about this method. So we're not going to worry about it for now.
    it.skip('recovers public keys from type 1 transaction', async () => {
      const hash = '0xa75bc0c12658f0fb1cdf501e9395c9cb9e5198c1ea34cbbac6c61caf94076e7c'; // sent with empty access list
      const tx = await ethersProvider.getTransaction(hash);
      expect(tx.type).to.equal(1);
      expect(await utils.recoverPublicKeyFromTransaction(hash, ethersProvider)).to.equal(publicKey);

      const hash2 = '0x9e35a3fbc2951060a169c0ed5a7bc858f2712617f358f8a7386626adca9cea07'; // sent with data in access list
      const tx2 = await ethersProvider.getTransaction(hash2);
      expect(tx2.type).to.equal(1);
      expect(await utils.recoverPublicKeyFromTransaction(hash2, ethersProvider)).to.equal(publicKey);
    });

    it('recovers public keys from type 2 transaction', async () => {
      const hash = '0x6e94b03ed7935d3d6a7a135748773ef580bc89a10db7d0657697a5cee1776648';
      const tx = await ethersProvider.getTransaction(hash);
      expect(tx.type).to.equal(2);
      expect(await utils.recoverPublicKeyFromTransaction(hash, ethersProvider)).to.equal(publicKey);

      const hash2 = '0x913cd745758e83ceb160718a4cc0080fb0699f083177eccb288500222a95e784';
      const tx2 = await ethersProvider.getTransaction(hash2);
      expect(tx2.type).to.equal(2);
      expect(await utils.recoverPublicKeyFromTransaction(hash2, ethersProvider)).to.equal(publicKey);
    });
  });

  describe('Recipient identifier lookups', () => {
    before(async () => {
      await ethersProvider.getNetwork();
      ethersProvider.network.name = 'sepolia'; // don't do this in prod, just for testing purposes so we use Sepolia registry, not localhost
    });

    // --- Public key or transaction hash ---
    it('looks up recipients by public key', async () => {
      const keys = await utils.lookupRecipient(publicKey, ethersProvider, { supportPubKey: true });
      expect(keys.spendingPublicKey).to.equal(pubKeysWallet.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysWallet.viewingPublicKey);
    });

    it('throws when looking up recipients by public key without explicitly allowing it', async () => {
      const errorMsg = `invalid address (argument="address", value="${publicKey}", code=INVALID_ARGUMENT, version=address/5.7.0)`; // prettier-ignore
      await expectRejection(utils.lookupRecipient(publicKey, ethersProvider), errorMsg);
    });

    it('throws when given a public key not on the curve', async () => {
      const errorMsg = 'Point is not on elliptic curve';
      await expectRejection(utils.lookupRecipient(badPublicKey, ethersProvider, { supportPubKey: true }), errorMsg);
    });

    it('looks up recipients by transaction hash', async () => {
      const hash = '0x2d067d6c2b6c1880fed6228d6b9cc9190810335c45f06ecb525f5a7860aaaf55';
      const keys = await utils.lookupRecipient(hash, ethersProvider, { supportTxHash: true });
      expect(keys.spendingPublicKey).to.equal(pubKeysWallet.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysWallet.viewingPublicKey);
    });

    it('throws when looking up recipients by transaction hash without explicitly allowing it', async () => {
      const hash = '0x2d067d6c2b6c1880fed6228d6b9cc9190810335c45f06ecb525f5a7860aaaf55';
      const errorMsg = `invalid address (argument="address", value="${hash}", code=INVALID_ARGUMENT, version=address/5.7.0)`; // prettier-ignore
      await expectRejection(utils.lookupRecipient(hash, ethersProvider), errorMsg);
    });

    // --- Address, advanced mode on (i.e. don't use the StealthKeyRegistry) ---
    it('looks up recipients by address, advanced mode on', async () => {
      const ethersProvider = new StaticJsonRpcProvider(`https://sepolia.infura.io/v3/${String(process.env.INFURA_ID)}`);
      const keys = await utils.lookupRecipient(address, ethersProvider, { advanced: true });
      expect(keys.spendingPublicKey).to.equal(pubKeysWallet.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysWallet.viewingPublicKey);
    });

    it('looks up recipients by ENS, advanced mode on', async () => {
      const ethersProvider = new StaticJsonRpcProvider(`https://sepolia.infura.io/v3/${String(process.env.INFURA_ID)}`);
      const keys = await utils.lookupRecipient('stratus4.eth', ethersProvider, { advanced: true });
      expect(keys.spendingPublicKey).to.equal(pubKeysWallet.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysWallet.viewingPublicKey);
    });

    it.skip('looks up recipients by CNS, advanced mode on', async () => {
      const ethersProvider = new StaticJsonRpcProvider(`https://sepolia.infura.io/v3/${INFURA_ID}`);
      const keys = await utils.lookupRecipient('udtestdev-msolomon.crypto', ethersProvider, { advanced: true });
      expect(keys.spendingPublicKey).to.equal(pubKeysWallet.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysWallet.viewingPublicKey);
    });

    // --- Address, advanced mode off (i.e. use the StealthKeyRegistry) ---
    it('looks up recipients by address, advanced mode off', async () => {
      const ethersProvider = new StaticJsonRpcProvider(`https://sepolia.infura.io/v3/${INFURA_ID}`); // otherwise throws with unsupported network since we're on localhost
      const keys = await utils.lookupRecipient(address, ethersProvider);
      expect(keys.spendingPublicKey).to.equal(pubKeysUmbra.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysUmbra.viewingPublicKey);

      // Same test, but with advanced mode off explicitly specified
      const keys2 = await utils.lookupRecipient(address, ethersProvider, { advanced: false });
      expect(keys2.spendingPublicKey).to.equal(pubKeysUmbra.spendingPublicKey);
      expect(keys2.viewingPublicKey).to.equal(pubKeysUmbra.viewingPublicKey);
    });

    it('looks up recipients by ENS, advanced mode off', async () => {
      const ethersProvider = new StaticJsonRpcProvider(`https://sepolia.infura.io/v3/${INFURA_ID}`);
      const keys = await utils.lookupRecipient('stratus4.eth', ethersProvider);
      // These values are set on the Sepolia resolver
      expect(keys.spendingPublicKey).to.equal(pubKeysUmbra.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysUmbra.viewingPublicKey);

      // Same test, but with advanced mode off explicitly specified
      const keys2 = await utils.lookupRecipient('stratus4.eth', ethersProvider, { advanced: false });
      expect(keys2.spendingPublicKey).to.equal(pubKeysUmbra.spendingPublicKey);
      expect(keys2.viewingPublicKey).to.equal(pubKeysUmbra.viewingPublicKey);
    });

    // Skipped since CNS support isn't really well supported currently anyway.
    it.skip('looks up recipients by CNS, advanced mode off', async () => {
      const keys = await utils.lookupRecipient('udtestdev-msolomon.crypto', ethersProvider);
      // These values are set on the Rinkeby resolver
      expect(keys.spendingPublicKey).to.equal(pubKeysUmbra.spendingPublicKey);
      expect(keys.viewingPublicKey).to.equal(pubKeysUmbra.viewingPublicKey);

      // Same test, but with advanced mode off explicitly specified
      const keys2 = await utils.lookupRecipient('udtestdev-msolomon.crypto', ethersProvider, { advanced: false });
      expect(keys2.spendingPublicKey).to.equal(pubKeysUmbra.spendingPublicKey);
      expect(keys2.viewingPublicKey).to.equal(pubKeysUmbra.viewingPublicKey);
    });

    describe('sortStealthKeyLogs', () => {
      it('should sort stealth key logs by block number in ascending order', () => {
        const logs = [{ blockNumber: 3 }, { blockNumber: 2 }, { blockNumber: 1 }] as Event[];
        const expected = [{ blockNumber: 1 }, { blockNumber: 2 }, { blockNumber: 3 }];
        const sortedLogs = utils.sortStealthKeyLogs(logs);
        for (let i = 0; i < logs.length; i++) {
          expect(sortedLogs[i].blockNumber).to.equal(expected[i].blockNumber);
        }
      });
    });

    // --- Address history by network ---
    it('looks up transaction history on mainnet', async () => {
      const ethersProvider = new StaticJsonRpcProvider(`https://mainnet.infura.io/v3/${INFURA_ID}`);
      const txHash = await utils.getSentTransaction(address, ethersProvider);
      expect(txHash).to.have.lengthOf(66);
    });

    it('looks up transaction history on sepolia', async () => {
      const ethersProvider = new StaticJsonRpcProvider(`https://sepolia.infura.io/v3/${INFURA_ID}`);
      const txHash = await utils.getSentTransaction(address, ethersProvider);
      expect(txHash).to.have.lengthOf(66);
    });

    it('looks up transaction history on polygon', async () => {
      const ethersProvider = new ethers.providers.StaticJsonRpcProvider(
        `https://polygon-mainnet.infura.io/v3/${INFURA_ID}`
      ) as EthersProvider;
      const txHash = await utils.getSentTransaction(address, ethersProvider);
      expect(txHash).to.have.lengthOf(66);
    });

    it('looks up transaction history on optimism', async () => {
      const ethersProvider = new ethers.providers.StaticJsonRpcProvider(
        `https://optimism-mainnet.infura.io/v3/${INFURA_ID}`
      ) as EthersProvider;
      const txHash = await utils.getSentTransaction(address, ethersProvider);
      expect(txHash).to.have.lengthOf(66);
    });

    it('looks up transaction history on arbitrum one', async () => {
      const ethersProvider = new ethers.providers.StaticJsonRpcProvider(
        `https://arbitrum-mainnet.infura.io/v3/${INFURA_ID}`
      ) as EthersProvider;
      const txHash = await utils.getSentTransaction(address, ethersProvider);
      expect(txHash).to.have.lengthOf(66);
    });
  });

  describe('Input validation', () => {
    // ts-expect-error statements needed throughout this section to bypass TypeScript checks that would stop this file
    // from being compiled/ran

    it('throws when recoverPublicKeyFromTransaction is given a bad transaction hash', async () => {
      const errorMsg = 'Invalid transaction hash provided';
      await expectRejection(utils.recoverPublicKeyFromTransaction('q', ethersProvider), errorMsg);
      // @ts-expect-error
      await expectRejection(utils.recoverPublicKeyFromTransaction(1, ethersProvider), errorMsg);
    });

    it('throws when recoverPublicKeyFromTransaction is given a transaction that does not exist', async () => {
      const mainnetTxHash = '0xce4209b4cf80e249502d770dd7f2b19ceb22bbb2cfb49500fe0a32d95b127e81';
      await expectRejection(
        utils.recoverPublicKeyFromTransaction(mainnetTxHash, ethersProvider),
        'Transaction hash not found. Are the provider and transaction hash on the same network?'
      );
    });

    it('throws when looking up an address that has not sent a transaction', async () => {
      const address = '0x0000000000000000000000000000000000000002';
      const ethersProvider = new StaticJsonRpcProvider(`https://sepolia.infura.io/v3/${INFURA_ID}`); // otherwise throws with unsupported network since we're on localhost
      const errorMsg = `Address ${address} has not registered stealth keys. Please ask them to setup their Umbra account`;
      await expectRejection(utils.lookupRecipient(address, ethersProvider), errorMsg);
    });

    it('throws when provided an invalid identifier', async () => {
      const id = '123';
      const errMsg = 'invalid address (argument="address", value="123", code=INVALID_ARGUMENT, version=address/5.7.0)';
      await expectRejection(utils.lookupRecipient(id, ethersProvider), errMsg);
    });
  });
});
