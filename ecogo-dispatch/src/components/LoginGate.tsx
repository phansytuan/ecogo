import { useState } from 'react';
import { requestOtp, verifyOtp } from '../auth/auth';
import { setToken } from '../auth/token';

export function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [dev, setDev] = useState<string | undefined>();
  const [err, setErr] = useState<string | undefined>();

  const send = async () => {
    setErr(undefined);
    try {
      const r = await requestOtp(phone);
      setDev(r.devCode);
      setStage('code');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const verify = async () => {
    setErr(undefined);
    try {
      const r = await verifyOtp(phone, code);
      if (!r.user.roles.includes('dispatcher') && !r.user.roles.includes('admin')) {
        setErr('Tài khoản này không có quyền điều phối.');
        return;
      }
      setToken(r.accessToken);
      onLogin();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="login">
      <div className="loginbox">
        <h1>ECOGO · Bàn điều phối</h1>
        {stage === 'phone' ? (
          <>
            <input
              placeholder="Số điện thoại"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button onClick={send}>Gửi mã OTP</button>
          </>
        ) : (
          <>
            {dev && <div className="devcode">Mã dev: {dev}</div>}
            <input placeholder="Mã OTP" value={code} onChange={(e) => setCode(e.target.value)} />
            <button onClick={verify}>Đăng nhập</button>
          </>
        )}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
