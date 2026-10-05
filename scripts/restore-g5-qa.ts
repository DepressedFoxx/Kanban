import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
/** Isolated technical rehearsal. No connection string and no remote writes. */
export async function restoreQa(
  snapshot: Record<string, any>,
  files: Map<string, Uint8Array>,
  outputDirectory?: string,
) {
  if (
    snapshot.schema_version !== 1 ||
    snapshot.manifest?.files !== 'metadata_only'
  )
    throw Error('Unsupported export')
  const db = new PGlite({ extensions: { pgcrypto } })
  const tables: Record<string, string> = {
    boards: 'public.boards',
    tasks: 'public.board_tasks',
    labels: 'public.workspace_labels',
    task_labels: 'public.task_labels',
    checklist: 'public.task_checklist',
    comments: 'public.task_comments',
    task_activity: 'public.task_activity',
    workspace_activity: 'public.workspace_activity',
  }
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
    for (const f of readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'))
    // Synthetic QA identities preserve UUID links without restoring Auth credentials.
    const identities = new Set<string>()
    function collect(value: any) {
      if (Array.isArray(value)) for (const v of value) collect(v)
      else if (value && typeof value === 'object')
        for (const [key, v] of Object.entries(value)) {
          if (
            [
              'owner_id',
              'user_id',
              'actor_id',
              'assignee_id',
              'created_by',
              'uploader_id',
              'edited_by',
              'deleted_by',
            ].includes(key) &&
            typeof v === 'string'
          )
            identities.add(v)
          else collect(v)
        }
    }
    collect(snapshot)
    for (const id of identities)
      await db.query(
        'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
        [id, `${id}@restore.invalid`],
      )
    await db.transaction(async (tx) => {
      const insert = async (table: string, rows: any[]) => {
        for (const row of rows) {
          const keys = Object.keys(row)
          if (keys.some((k) => !/^[a-z_][a-z0-9_]*$/.test(k)))
            throw Error('Invalid column')
          await tx.query(
            `insert into ${table} (${keys.map((k) => `"${k}"`).join(',')}) overriding system value values(${keys.map((_, i) => '$' + (i + 1)).join(',')})`,
            keys.map((k) =>
              row[k] && typeof row[k] === 'object'
                ? JSON.stringify(row[k])
                : row[k],
            ),
          )
        }
      }

      // Disable business USER triggers only: foreign keys remain enforced. Historical
      // comments/assignments must not create fresh notifications or duplicate history.
      for (const table of [
        'public.workspaces',
        'public.workspace_members',
        ...Object.values(tables),
      ])
        await tx.exec(`alter table ${table} disable trigger user`)
      await insert('public.workspaces', [snapshot.workspace])
      await insert('public.workspace_members', snapshot.members)
      for (const [key, table] of Object.entries(tables)) {
        if (snapshot.manifest.counts[key] !== snapshot[key].length)
          throw Error('Manifest mismatch: ' + key)
        await insert(table, snapshot[key])
      }
      await insert(
        'workspace_internal.attachments',
        snapshot.attachments.map((a: any) => ({ ...a, state: 'ready' })),
      )
      for (const table of [
        'public.workspaces',
        'public.workspace_members',
        ...Object.values(tables),
      ])
        await tx.exec(`alter table ${table} enable trigger user`)
    })
    for (const table of ['public.task_activity', 'public.workspace_activity']) {
      await db.exec(
        `select setval(pg_get_serial_sequence('${table}','id'),coalesce(max(id),1),max(id) is not null) from ${table}`,
      )
    }
    const filesReport = []
    for (const file of snapshot.attachments) {
      const bytes = files.get(file.id)
      if (
        !bytes ||
        bytes.length !== file.size ||
        createHash('sha256').update(bytes).digest('hex') !== file.sha256
      )
        throw Error('Missing or corrupt backup file: ' + file.id)
      const path = `${snapshot.workspace.id}/${file.task_id}/${file.id}`
      if (
        file.object_path !== path ||
        !path.split('/').every((s) => /^[0-9a-f-]{36}$/.test(s))
      )
        throw Error('Invalid object path')
      if (outputDirectory) {
        const base = resolve(outputDirectory),
          dest = resolve(base, path)
        if (!dest.startsWith(base + '\\') && !dest.startsWith(base + '/'))
          throw Error('Unsafe restore target')
        mkdirSync(resolve(dest, '..'), { recursive: true })
        writeFileSync(dest, bytes)
      }
      filesReport.push({
        id: file.id,
        sha256: file.sha256,
        bytes: bytes.length,
      })
    }
    const roles = []
    for (const member of snapshot.members) {
      const role = await db.transaction(async (tx) => {
        await tx.exec('set local role authenticated')
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          member.user_id,
        ])
        return (
          await tx.query<{ role: string }>(
            'select public.workspace_role($1) role',
            [snapshot.workspace.id],
          )
        ).rows[0]!.role
      })
      if (role !== member.role) throw Error('Role mismatch')
      roles.push({ id: member.user_id, role })
    }
    const owner = snapshot.members.filter((m: any) => m.role === 'owner')
    if (owner.length !== 1 || owner[0].user_id !== snapshot.workspace.owner_id)
      throw Error('Owner invariant')
    if (snapshot.manifest.counts.attachments !== filesReport.length)
      throw Error('File manifest mismatch')
    return {
      completed: true,
      engine: 'isolated PGlite + local filesystem',
      schema_version: 1,
      identity_mapping:
        'UUID preserved; synthetic QA Auth identities; no passwords or sessions',
      roles,
      files: filesReport,
      counts: snapshot.manifest.counts,
      managedStorageRestored: false,
    }
  } finally {
    await db.close()
  }
}
