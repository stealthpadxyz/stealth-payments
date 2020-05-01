/**
 * Umbra Proof of Concept
 *
 * References:
 *   - Example of signing message and recovering public key with ethers.js
 *     https://github.com/ethers-io/ethers.js/issues/447#issuecomment-519163178
 *   - Example of how to derive an Ethereum address from its private key
 *     https://hackernoon.com/utilizing-cryptography-libraries-to-derive-ethereum-addresses-from-private-keys-1bedd1a85bd
 */

const EC = require("elliptic").ec;
const keccak256 = require("js-sha3").keccak256;
const ethers = require("ethers");
const Buffer = require('buffer/').Buffer

const ec = new EC("secp256k1");
const utils = ethers.utils;

/**
 * @notice If value is not 64 characters long, leading zeros were stripped and we should add
 * them back. It seems elliptic sometimes strips leading zeros when pulling out x and y
 * coordinates from public keys which can cause errors when checking that keys match
 * @param {String} hex String to pad, without leading 0x
 */
function pad32ByteHex(hex) {
  return hex.padStart(64, 0);
}

(async () => {
  // Step 0 ========================================================================================
  // Setup test accounts

  // Generate random wallets
  const sender = ethers.Wallet.createRandom(); // currently not used
  const receiver = ethers.Wallet.createRandom();


  // Step 1 ========================================================================================
  // Recover recipient's public key from their private key

  // Have recipient sign message
  const message = "I love Umbra!";
  const signature = await receiver.signMessage(message);

  // Recover their public key
  const messageHash = utils.hashMessage(message);
  const messageHashBytes = utils.arrayify(messageHash);
  recoveredPublicKey = utils.recoverPublicKey(messageHashBytes, signature);
  if (recoveredPublicKey !== receiver.publicKey) {
    throw new Error("Recipient's public key was not properly recovered");
  }
  console.log("Step 1: Public key successfully recovered from recipient signature");


  // Step 2 ========================================================================================
  // Publish recipient's public key as ENS record

  // TODO: Not applicable for POC
  console.log("Step 2: N/A");


  // Step 3 ========================================================================================
  // Sender generates random number

  // Generate 32-byte random value with randomBytes, shuffle the order for additional randomness
  const randomArray = utils.shuffled(utils.randomBytes(32)); // returns Uint8Array

  // Convert to BigNumber, represented as Hex, with the 0x prefix removed
  const randomValue = ethers.BigNumber.from(randomArray).toHexString().slice(2);
  console.log("Step 3: 32-byte random number successfully generated");


  // Step 4 ========================================================================================
  // Sender securely sends random number to recipient

  // We do this before step 5 to ensure recipient receives random number before
  // sending funds to that address
  // TODO: Not applicable for POC
  console.log("Step 4: N/A");


  // Step 5 ========================================================================================
  // Sender computes receiving address and send funds

  // Convert recipient's public key into x,y coordinates. This requires us to remove the
  // 0x04 prefix for compatibility with what elliptic expects.
  // Note: The 0x04 prefix is a standard for representing an uncompressed point. For more
  // information see https://github.com/ethereumbook/ethereumbook/blob/develop/04keys-addresses.asciidoc#generating-a-public-key
  receiverPublicKey = receiver.publicKey.slice(4);
  receiverPublicKeyX = receiverPublicKey.slice(0,64);
  receiverPublicKeyY = receiverPublicKey.slice(64);

  if (receiverPublicKey !== receiverPublicKeyX + receiverPublicKeyY) {
    throw new Error("receiver's public key coordinates were incorrectly generated");
  }

  // Generate elliptic (EC) instance from this public key
  receiverPublicKeyEC = ec.keyFromPublic({
    x: receiverPublicKeyX,
    y: receiverPublicKeyY,
  });

  // Get stealth public key by multiplying public key coordinate by the random value
  const stealthPublicKeyEC = receiverPublicKeyEC.getPublic().mul(randomValue);

  // Convert stealth public key elliptic instance to hex string
  const stealthPublicKeyX = pad32ByteHex(stealthPublicKeyEC.getX().toString('hex'));
  const stealthPublicKeyY = pad32ByteHex(stealthPublicKeyEC.getY().toString('hex'));
  const stealthPublicKey = stealthPublicKeyX + stealthPublicKeyY; // string concatenation

  // Take the hash of that public key
  const stealthPublicKeyHash = keccak256(new Buffer(stealthPublicKey, 'hex'));

  // Convert hash to buffer, where last 20 bytes are the Ethereum address
  const stealthAddressBuffer = new Buffer(stealthPublicKeyHash, 'hex');
  const stealthAddress = `0x${stealthAddressBuffer.slice(-20).toString('hex')}`;
  console.log('Step 5: Sender computed receiving address of ', stealthAddress);

  // TODO Send funds

  // Step 6 ========================================================================================
  // Recipient computes required private key and retrieves funds

  // Generate elliptic instance from receiver's private key. We remove the 0x prefix
  // as required by elliptic
  receiverPrivateKeyEC = ec.keyFromPrivate(receiver.privateKey.slice(2));

  // Check that this public key associated with receiverPrivateKeyEC, which was generated from the
  // recipient's private key, has the same public key as the elliptic instance
  // generated from the public key published by the sender
  if (
    receiverPublicKeyX !== pad32ByteHex(receiverPrivateKeyEC.getPublic().getX().toString("hex")) ||
    receiverPublicKeyY !== pad32ByteHex(receiverPrivateKeyEC.getPublic().getY().toString("hex"))
  ) {
    console.log('X Components:');
    console.log(receiverPublicKeyX);
    console.log(pad32ByteHex(receiverPrivateKeyEC.getPublic().getX().toString("hex")));
    console.log();
    console.log('Y Components:');
    console.log(receiverPublicKeyY);
    console.log(pad32ByteHex(receiverPrivateKeyEC.getPublic().getY().toString("hex")));
    throw new Error("Public keys of the two elliptic instances do not match");
  }

  // Calculate stealth private key by multiplying private key with random value. This
  // gives us an arbitrarily large number that is not necessarily in the domain of
  // the secp256k1 elliptic curve
  const randomValueBN = ethers.BigNumber.from(`0x${randomValue}`);
  const receiverPrivateKeyBN = ethers.BigNumber.from(
    `0x${receiverPrivateKeyEC.getPrivate().toString("hex")}`
  );
  const stealthPrivateKeyFull = receiverPrivateKeyBN.mul(randomValueBN).toHexString().slice(2);

  // Modulo operation to get private key to be in correct range, where ec.n gives the
  // order of our curve
  const stealthPrivateKeyBN = ethers.BigNumber.from(`0x${stealthPrivateKeyFull}`);
  const stealthPrivateKey = stealthPrivateKeyBN.mod(`0x${ec.n.toString('hex')}`);

  // Get stealth public key by multiplying private key (with the 0x prefix removed) by
  // the curve's generator point, given by ec.g
  const stealthPublicKeyXY2 = ec.g.mul(stealthPrivateKey.toHexString().slice(2));
  const stealthPublicKeyX2 = stealthPublicKeyXY2.getX().toString('hex');
  const stealthPublicKeyY2 = stealthPublicKeyXY2.getY().toString('hex');

  // Public Key = X and Y concatenated
  const stealthPublicKey2 = stealthPublicKeyX2 + stealthPublicKeyY2;

  // Take the hash of that public key
  const stealthPublicKeyHash2 = keccak256(new Buffer(stealthPublicKey2, 'hex'));

  // Convert hash to buffer, where last 20 bytes are the Ethereum address
  const stealthAddressBuffer2 = new Buffer(stealthPublicKeyHash2, 'hex');
  const stealthAddress2 = `0x${stealthAddressBuffer2.slice(-20).toString('hex')}`;

  // Use private key to generate ethers wallet and check addresses
  console.log('Step 6: Checking that receiver computed same receiving address:');
  const stealthWallet = new ethers.Wallet(stealthPrivateKey);
  console.log('  Check 1: ', stealthWallet.address === utils.getAddress(stealthAddress));
  console.log('  Check 2: ', stealthWallet.address === utils.getAddress(stealthAddress2));

  if (stealthAddress !== stealthAddress2) {
    throw new Error('Stealth addresses do not match')
  }

  console.log();
  console.log('Complete! Outputs are below');
  console.log('  Stealth address:      ', stealthAddress);
  console.log('  Stealth public key:   ', stealthPublicKey);
  console.log('  Stealth private key:  ', stealthPrivateKey.toHexString());
  console.log();

  // TODO Retrieve funds

})();
