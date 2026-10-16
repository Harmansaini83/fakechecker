import type { Verdict } from './api';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export const VERDICT_INFO: Record<Verdict, { title: string; summary: string; tone: Tone; nextStep: string }> = {
  verified: {
    title: 'Code matches our records',
    summary: 'This code is registered and its digital signature is valid.',
    tone: 'good',
    nextStep: 'Check that the packet seal and label look normal, and that you bought it from a licensed dealer.',
  },
  suspicious: {
    title: 'Suspicious: be careful',
    summary: 'This code was scanned in unusual ways (for example very many times, or in places far apart). The packet may be a copy.',
    tone: 'warn',
    nextStep: 'Do not use it yet. Ask the dealer for the purchase bill and report this packet.',
  },
  unverified: {
    title: 'Could not be verified',
    summary: 'We do not recognise who issued this code. That does not prove the product is fake.',
    tone: 'neutral',
    nextStep: 'Ask the dealer for the bill and licence details, and check the packet with the manufacturer.',
  },
  invalid: {
    title: 'Invalid code',
    summary: 'The code is damaged, altered, or is not a FakeChecker code.',
    tone: 'bad',
    nextStep: 'Try scanning again. If it still fails, do not trust this packet and report it.',
  },
  expired: {
    title: 'Product expired',
    summary: 'The code is real but this batch is past its expiry date.',
    tone: 'bad',
    nextStep: 'Do not use it. Return it to the dealer.',
  },
  recalled: {
    title: 'Batch recalled',
    summary: 'The manufacturer has recalled this batch.',
    tone: 'bad',
    nextStep: 'Stop using it and contact the dealer or manufacturer.',
  },
  confirmed_counterfeit: {
    title: 'Reported as counterfeit',
    summary: 'This code has been confirmed as counterfeit by our reviewers.',
    tone: 'bad',
    nextStep: 'Do not use it. Keep the packet and report where you bought it.',
  },
};

export const DISCLAIMER =
  'A matching code does not prove the product inside is genuine. Always check the packaging and buy from licensed dealers.';

export function reasonText(r: unknown): string {
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    for (const k of ['message', 'text', 'description', 'code']) {
      if (typeof o[k] === 'string') return o[k] as string;
    }
  }
  return '';
}