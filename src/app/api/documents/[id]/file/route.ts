import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseStore } from '@/features/documents/store'

/**
 * Any signed-in role may view a trade document. The file itself sits in a
 * private bucket; this redirects to a short-lived (5 min) signed URL.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await ctx.params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [doc] = await db().select({ path: schema.documents.storagePath }).from(schema.documents).where(eq(schema.documents.id, id))
  const admin = supabaseAdmin()
  if (!doc || !admin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = await supabaseStore(admin).signedUrl(doc.path)
  if (!url) return NextResponse.json({ error: 'File unavailable' }, { status: 404 })
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } })
}
