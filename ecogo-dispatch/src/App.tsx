import { useEffect, useState } from 'react';
import { clearToken, getToken } from './auth/token';
import { setUnauthorizedHandler } from './api/client';
import { ToastProvider } from './ui/toast';
import { LoginGate } from './components/LoginGate';
import { Cockpit } from './components/Cockpit';

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setTokenState(null);
    });
  }, []);

  return (
    <ToastProvider>
      {token ? (
        <Cockpit onLogout={() => { clearToken(); setTokenState(null); }} />
      ) : (
        <LoginGate onLogin={() => setTokenState(getToken())} />
      )}
    </ToastProvider>
  );
}
