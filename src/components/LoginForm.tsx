// src/components/LoginForm.tsx
"use client"

// ★ React 19: useFormState kaldırıldı, yerine react'ten useActionState
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { loginAction, type LoginState } from "@/actions/auth.actions"
import { Input, Label, ErrorBox } from "@/components/ui"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-xl bg-primary text-[14px] font-semibold text-onPrimary transition-all
                 hover:bg-accentD active:scale-[0.985]
                 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
    >
      {pending ? "Giriş yapılıyor…" : "Giriş yap"}
    </button>
  )
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {})

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px] animate-fade-up">
        {/* Logo / başlık */}
        <div className="mb-8 text-center">
          {/* ★ Gerçek logo: karanlıkta kays1.png, açıkta kays.png.
                CSS tema sınıfına göre seçiyor (JS beklemeden). */}
          {/* ★ Sadece logo — "Kays Admin" başlığı ve alt yazı kaldırıldı,
                logo iyice büyütüldü (128px). */}
          <div className="mx-auto mb-2 flex h-32 w-32 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kays1.png" alt="Kays" width={128} height={128} className="h-32 w-32 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kays.png" alt="Kays" width={128} height={128} className="hidden h-32 w-32 object-contain" data-light-logo />
          </div>
        </div>

        <form action={formAction} className="space-y-4 rounded-2xl border border-border bg-surface p-6">
          <input type="hidden" name="next" value={nextPath} />

          <div>
            <Label>Kullanıcı adı</Label>
            <Input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
            />
          </div>

          <div>
            <Label>Şifre</Label>
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {state.error && <ErrorBox>{state.error}</ErrorBox>}

          <div className="pt-1">
            <SubmitButton />
          </div>
        </form>
      </div>
    </main>
  )
}
