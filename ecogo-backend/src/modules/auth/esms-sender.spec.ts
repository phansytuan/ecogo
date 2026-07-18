import axios from 'axios';
import { EsmsSender } from './sms.provider';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    isAxiosError: (error: any) => error?.isAxiosError === true,
  },
}));

describe('EsmsSender', () => {
  const post = axios.post as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the expected eSMS request', async () => {
    post.mockResolvedValue({ data: { CodeResult: '100' } });
    const config = {
      get: (key: string) =>
        ({
          'esms.apiKey': 'api-key',
          'esms.secretKey': 'secret-key',
          'esms.brandname': '',
          'esms.smsType': '2',
          'esms.sandbox': true,
        })[key],
    };
    const sender = new EsmsSender(config as any);

    await sender.send('+84901234567', 'OTP message');

    expect(post).toHaveBeenCalledWith(
      'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/',
      {
        ApiKey: 'api-key',
        SecretKey: 'secret-key',
        Phone: '+84901234567',
        Content: 'OTP message',
        SmsType: '2',
        Sandbox: 1,
      },
      { timeout: 10_000 },
    );
    expect(post.mock.calls[0][1]).not.toHaveProperty('Brandname');
  });

  it('rejects unsuccessful eSMS result codes', async () => {
    post.mockResolvedValue({
      data: {
        CodeResult: '104',
        ErrorMessage: 'Invalid credentials',
      },
    });
    const sender = new EsmsSender({
      get: (key: string) => (key === 'esms.smsType' ? '2' : ''),
    } as any);

    await expect(
      sender.send('+84901234567', 'OTP message'),
    ).rejects.toThrow('104');
  });

  it('rejects axios failures with a status-only error', async () => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 502 },
    });
    const sender = new EsmsSender({
      get: (key: string) => (key === 'esms.smsType' ? '2' : ''),
    } as any);

    await expect(
      sender.send('+84901234567', 'OTP message'),
    ).rejects.toThrow('eSMS request failed (HTTP 502)');
  });
});
