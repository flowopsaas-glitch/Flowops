// src/components/LoginForm.tsx
import { useState } from 'react';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState('admin@alpha.com');
  const [password, setPassword] = useState('password123');

  return (
    <div>
      <h2>Login</h2>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <br />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <br />
      <button onClick={() => onLogin(email, password)}>Login</button>
    </div>
  );
}

<div className="p-6 rounded-2xl bg-black text-white border border-blue-500">
  Tailwind v4 is LIVE ✅
</div>