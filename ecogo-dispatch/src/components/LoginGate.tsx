import { useState } from 'react';
import { requestOtp, verifyOtp } from '../auth/auth';
import { setSession } from '../auth/token';

export function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [dev, setDev] = useState<string | undefined>();
  const [err, setErr] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const fail = (msg: string) => {
    setErr(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const send = async () => {
    setErr(undefined); setLoading(true);
    try {
      const r = await requestOtp(phone);
      setDev(r.devCode);
      setStage('code');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Không gửi được OTP');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setErr(undefined); setLoading(true);
    try {
      const r = await verifyOtp(phone, code);
      if (!r.user.roles.includes('dispatcher') && !r.user.roles.includes('admin')) {
        fail('Tài khoản này không có quyền điều phối.');
        return;
      }
      setSession(r.accessToken, r.refreshToken);
      onLogin();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Mã OTP không đúng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className={'loginbox' + (shake ? ' shake' : '')}>
        <div className="login-brand">
          <span className="brand-mark">E</span>
          <div>
            <div className="login-title">ECOGO</div>
          </div>
        </div>
        <div className="login-sub">Bàn điều phối · đăng nhập</div>

        {stage === 'phone' ? (
          <>
            <div className="field">
              <label>Số điện thoại</label>
              <input className="input" value={phone} inputMode="tel"
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()} />
            </div>
            <button className="btn btn-primary btn-block" onClick={send} disabled={loading || !phone}>
              {loading ? <span className="spinner" /> : 'Gửi mã OTP'}
            </button>
          </>
        ) : (
          <>
            {dev && <div className="devcode">Mã dev: {dev}</div>}
            <div className="field">
              <label>Mã OTP</label>
              <input className="input" value={code} inputMode="numeric" autoFocus
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verify()} />
            </div>
            <button className="btn btn-primary btn-block" onClick={verify} disabled={loading || !code}>
              {loading ? <span className="spinner" /> : 'Đăng nhập'}
            </button>
          </>
        )}
        {err && <div className="form-err">{err}</div>}
      </div>
    </div>
  );
}
