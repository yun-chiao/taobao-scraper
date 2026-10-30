import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMacValue, verifyMacValue } from '../server/src/lib/ecpay.js';

test('checkMacValue computes deterministic SHA256 uppercase signature and verifyMacValue validates it', () => {
  const hashKey = 'pwFHCqoQZGmho4w6';
  const hashIv = 'EkRm7iFT261dpevs';
  const params = {
    MerchantID: '3002607',
    MerchantTradeNo: 'listio20261029001',
    MerchantTradeDate: '2026/10/29 18:00:00',
    PaymentType: 'aio',
    TotalAmount: 390,
    TradeDesc: 'Listio Pro 月費訂閱',
    ItemName: 'Listio Pro 方案 x 1',
    ReturnURL: 'https://api.listio.app/v1/webhooks/ecpay',
    ChoosePayment: 'Credit',
    EncryptType: 1,
  };

  const mac = checkMacValue(params, hashKey, hashIv);
  assert.match(mac, /^[0-9A-F]{64}$/);
  assert.equal(verifyMacValue({ ...params, CheckMacValue: mac }, hashKey, hashIv), true);
  assert.equal(verifyMacValue({ ...params, CheckMacValue: 'INVALID' }, hashKey, hashIv), false);
});
