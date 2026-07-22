// src/components/LoginOverlay.jsx
import React, { useState } from "react";
import { useAuth } from "../auth/useAuth";

const LoginOverlay = () => {
  const { loginEmail, registerEmail, loginGoogle, error, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isRegister) {
      await registerEmail(email, password);
    } else {
      await loginEmail(email, password);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 text-white">
      <div className="bg-slate-800 bg-opacity-80 rounded-lg p-8 shadow-xl backdrop-blur-md w-96">
        <h2 className="text-2xl font-bold mb-4 text-center">Login</h2>
        {error && <p className="text-red-400 mb-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 rounded bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded transition"
          >
            {isRegister ? "Register" : "Login"}
          </button>
        </form>
        <div className="my-4 flex items-center justify-center">
          <button
            onClick={loginGoogle}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded transition"
          >
            <i className="fa-brands fa-google"></i> Sign in with Google
          </button>
        </div>
        <p className="text-center text-sm mt-2">
          {isRegister ? "Already have an account? " : "New here? "}
          <span
            className="cursor-pointer text-blue-400 underline"
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? "Login" : "Register"}
          </span>
        </p>
      </div>
    </div>
  );
};

export default LoginOverlay;
