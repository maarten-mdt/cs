import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const errorDomain = searchParams.get("error") === "domain";
  const errorConfig = searchParams.get("error") === "config";
  const apiUrl = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    fetch(`${apiUrl}/auth/me`, { credentials: "include" })
      .then((res) => {
        if (res.ok) navigate("/", { replace: true });
      })
      .catch(() => {});
  }, [apiUrl, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111213]">
      <div className="w-full max-w-sm rounded-lg border border-border-dark bg-panel p-8 text-center">
        <h1 className="text-2xl font-semibold text-accent mb-6">MDT Support</h1>
        <p className="text-gray-400 text-sm mb-6">
          Sign in with your @mdttac.com account
        </p>
        {errorDomain && (
          <p className="text-red-500 text-sm mb-4">
            Access restricted to @mdttac.com accounts
          </p>
        )}
        {errorConfig && (
          <p className="text-red-500 text-sm mb-4">
            Google sign-in is not configured. Contact your administrator.
          </p>
        )}
        <a
          href={`${apiUrl}/auth/google`}
          className="inline-flex items-center justify-center w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark transition-colors"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
