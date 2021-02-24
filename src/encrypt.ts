import { publicEncrypt, randomBytes, createCipheriv, constants } from 'crypto';

import stringify from 'fast-json-stable-stringify';
import bs58 from 'bs58';

import { EncryptedData } from './types';
import { decodeKey, derToPem } from './helpers';
import { CryptoError } from './types/CryptoError';

/**
 * @param {string} did the DID and key identifier fragment resolving to the public key
 * @param {string} publicKey RSA public key (pem or base58)
 * @param {object} data data to encrypt (JSON-serializable object)
 * @param {string} encoding the encoding used for the publicKey ('base58' or 'pem', default 'pem')
 * @returns {EncryptedData} contains the encrypted data as a base58 string plus RSA-encrypted/base58-encoded
 *                          key, iv, and algorithm information needed to recreate the AES key actually used for encryption
 */
export function encrypt (did: string, publicKey: string, data: unknown, encoding: 'base58' | 'pem' = 'pem'): EncryptedData {
  try {
    // serialize data as a deterministic JSON string
    const stringifiedData = stringify(data);

    // decode the public key, if necessary
    const decodedPublicKey = decodeKey(publicKey, encoding);

    // node can only encrypt with pem-encoded keys
    const publicKeyPem = derToPem(decodedPublicKey, 'public');

    // create aes key for encryption
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const algorithm = 'aes-256-cbc';
    const cipher = createCipheriv(algorithm, key, iv);

    // encrypt data with aes key
    const encrypted1 = cipher.update(stringifiedData);
    const encrypted2 = cipher.final();
    const encrypted = Buffer.concat([encrypted1, encrypted2]);

    // we need to use a key object to set non-default padding
    // for interoperability with android/ios cryptography implementations
    const publicKeyObj = {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_PADDING
    };

    // encrypt aes key with public key
    const encryptedIv = publicEncrypt(publicKeyObj, iv);
    const encryptedKey = publicEncrypt(publicKeyObj, key);
    const encryptedAlgo = publicEncrypt(publicKeyObj, Buffer.from(algorithm));

    // return EncryptedData object with encrypted data and aes key info
    return {
      data: bs58.encode(encrypted),
      key: {
        iv: bs58.encode(encryptedIv),
        key: bs58.encode(encryptedKey),
        algorithm: bs58.encode(encryptedAlgo),
        did
      }
    };
  } catch (e) {
    throw new CryptoError(e.message, e.code);
  }
}
