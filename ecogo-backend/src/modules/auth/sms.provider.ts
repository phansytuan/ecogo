import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

export const SMS_SENDER = 'SMS_SENDER';

@Injectable()
export class FakeSmsSender implements SmsSender {
  async send(): Promise<void> {
    // Fake mode returns the code through the development API response.
  }
}

@Injectable()
export class EsmsSender implements SmsSender {
  constructor(private readonly config: ConfigService) {}

  async send(phone: string, message: string): Promise<void> {
    const brandname = this.config.get<string>('esms.brandname') ?? '';
    const sandbox = this.config.get<boolean>('esms.sandbox') ?? false;

    try {
      const response = await axios.post(
        'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/',
        {
          ApiKey: this.config.get<string>('esms.apiKey') ?? '',
          SecretKey: this.config.get<string>('esms.secretKey') ?? '',
          Phone: phone,
          Content: message,
          SmsType: this.config.get<string>('esms.smsType') ?? '2',
          ...(brandname ? { Brandname: brandname } : {}),
          ...(sandbox ? { Sandbox: 1 } : {}),
        },
        { timeout: 10_000 },
      );

      if (response.data?.CodeResult !== '100') {
        throw new Error(
          `eSMS rejected the message (${response.data?.CodeResult}: ${
            response.data?.ErrorMessage ?? 'unknown'
          })`,
        );
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        throw new Error(
          `eSMS request failed (HTTP ${status ?? 'unavailable'})`,
        );
      }
      throw error;
    }
  }
}
