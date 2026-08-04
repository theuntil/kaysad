// src/app/(dashboard)/politikalar/page.tsx

import { fetchPolicies } from "@/actions/policy.actions"
import { PageHeader } from "@/components/PageHeader"
import { PolicyManager } from "@/components/PolicyManager"
import { ErrorBox } from "@/components/ui"

export const dynamic = "force-dynamic"

export default async function PoliciesPage() {
  const { items, error } = await fetchPolicies()

  return (
    <>
      <PageHeader title="Politikalar" />
      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}
      <PolicyManager items={items} />
    </>
  )
}
