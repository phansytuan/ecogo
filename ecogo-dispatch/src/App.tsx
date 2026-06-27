import { useState } from 'react';
import { clearToken, getToken } from './auth/token';
import { LoginGate } from './components/LoginGate';
import { Cockpit } from './components/Cockpit';

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken());
  if (!token) return <LoginGate onLogin={() => setTokenState(getToken())} />;
  return (
    <Cockpit
      onLogout={() => {
        clearToken();
        setTokenState(null);
      }}
    />
  );
}
