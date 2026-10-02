// Runs real PostgreSQL, using isolated test tools rather than application dependencies.
// YOUTUBE_TEST_TOOL_ROOT may point to a directory containing node_modules with
// embedded-postgres@17.10.0-beta.17 and pg. No remote DB URL is ever accepted.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const toolRoot = path.resolve(process.env.YOUTUBE_TEST_TOOL_ROOT || path.join(root, '../youtube-validation-tools'));
const requireTool = createRequire(path.join(toolRoot, 'package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(requireTool.resolve('embedded-postgres')));
const { Client } = requireTool('pg');
await fs.mkdir(path.join(toolRoot, 'runs'), { recursive: true });
const clusterPath = await fs.mkdtemp(path.join(toolRoot, 'runs', 'youtube-pg-'));
const listener = net.createServer();
await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port;
await new Promise(r => listener.close(r));
const password = crypto.randomBytes(24).toString('hex');
const server = new EmbeddedPostgres({ databaseDir: clusterPath, port, user: 'postgres', password,
  persistent: true, postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} });
const config = { host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', connectionTimeoutMillis: 5000, statement_timeout: 5000 };
const clients = [];
async function connect() { const client = new Client(config); clients.push(client); await client.connect(); return client; }
let count = 0;
async function check(name, work) { await work(); count++; console.log(`PASS ${name}`); }
const channel = suffix => 'UC' + suffix.repeat(22);
let db;
async function team() {
  const user = crypto.randomUUID(), team = crypto.randomUUID();
  await db.query('insert into auth.users values($1);', [user]);
  await db.query('insert into teams(id,owner_id) values($1,$2)', [team,user]);
  await db.query("insert into team_members(team_id,user_id,role) values($1,$2,'owner')", [team,user]);
  return { user, team };
}
async function account(t, id = channel('a')) {
  return (await db.query("insert into platform_accounts(user_id,team_id,provider,platform_user_id,refresh_token,access_token,label,profile_name) values($1,$2,'youtube',$3,'old-refresh','old-access','My label','My label') returning *", [t.user,t.team,id])).rows[0];
}
async function attempt(t, a = null, id = channel('a')) {
  return (await db.query("insert into youtube_connection_attempts(id,user_id,team_id,browser_hash,return_path,status,identity,credential_envelope,previous_account_id) values($1,$2,$3,'binding','/settings','awaiting_confirmation',$4,'encrypted-test-only',$5) returning *",
    [crypto.randomUUID(), t.user,t.team, JSON.stringify({ channelId: id,title: 'Actual channel', customUrl: '@Actual', avatarUrl: null }), a?.id || null])).rows[0];
}
async function confirm(c, t, a, previous = null) {
  return (await c.query('select confirm_youtube_connection($1,$2,$3,$4,$5,$6,$7,$8) as id',
    [a.id,t.user,t.team,'new-refresh','new-access',null,previous?.id || null,previous?.refresh_token || null])).rows[0].id;
}
async function rejected(promise, pattern) { await assert.rejects(promise, pattern); }
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  await server.initialise(); await server.start(); db = await connect();
  console.log('PostgreSQL ' + (await db.query('show server_version')).rows[0].server_version);
  await db.query(await fs.readFile(path.join(root,'scripts/integration/fixtures/youtube-existing-schema.sql'),'utf8'));
  const beforeTeam = await team(), beforeAccount = await account(beforeTeam);
  await db.query("insert into scheduled_posts(team_id,platform_account_id,provider,youtube_settings) values($1,$2,'youtube','{\"is_short\":true}')", [beforeTeam.team,beforeAccount.id]);
  const beforePosts = (await db.query('select * from scheduled_posts')).rows;
  await db.query(await fs.readFile(path.join(root,'supabase/migrations/20261002000000_youtube_channel_confirmation.sql'),'utf8'));
  await check('migration preserves existing accounts and scheduled destinations', async () => {
    assert.deepEqual((await db.query('select * from platform_accounts where id=$1',[beforeAccount.id])).rows[0],beforeAccount);
    assert.deepEqual((await db.query('select * from scheduled_posts')).rows,beforePosts);
  });
  await check('client roles cannot access secrets or execute privileged RPCs', async () => {
    for (const role of ['anon','authenticated']) {
      await db.query(`set role ${role}`);
      for (const table of ['youtube_connection_attempts','youtube_account_identity','youtube_identity_refresh_limits']) await rejected(db.query(`select * from ${table}`),/permission denied/);
      await rejected(db.query('select cleanup_youtube_connections()'),/permission denied/);
      await rejected(db.query('select claim_youtube_identity_refresh($1)',[beforeAccount.id]),/permission denied/);
      await rejected(confirm(db,beforeTeam,{id:crypto.randomUUID()}),/permission denied/);
      await db.query('reset role');
    }
  });
  await check('confirmation is atomic and repeated requests return the same account', async () => {
    const t=await team(), a=await attempt(t); await db.query('set role service_role');
    const id=await confirm(db,t,a); assert.equal(await confirm(db,t,a),id); await db.query('reset role');
    const row=(await db.query('select * from youtube_connection_attempts where id=$1',[a.id])).rows[0];
    assert.equal(row.status,'confirmed'); assert.equal(row.credential_envelope,null);
    assert.equal((await db.query('select count(*)::int as n from platform_accounts where team_id=$1',[t.team])).rows[0].n,1);
  });
  await check('reconnect preserves label, ownership, account ID and scheduled references', async () => {
    const a=await attempt(beforeTeam,beforeAccount); const id=await confirm(db,beforeTeam,a,beforeAccount);
    assert.equal(id,beforeAccount.id);
    const saved=(await db.query('select * from platform_accounts where id=$1',[id])).rows[0];
    for (const k of ['id','user_id','team_id','profile_name','label']) assert.equal(saved[k],beforeAccount[k]);
    assert.equal(saved.refresh_token,'new-refresh'); assert.deepEqual((await db.query('select * from scheduled_posts')).rows,beforePosts);
  });
  await check('parallel confirmations of one attempt create exactly one account', async () => {
    const t=await team(), a=await attempt(t), x=await connect(), y=await connect();
    const ids=await Promise.all([confirm(x,t,a),confirm(y,t,a)]); assert.equal(ids[0],ids[1]);
  });
  await check('different pending attempts cannot overwrite a newly confirmed connection', async () => {
    const t=await team(), a=await attempt(t), b=await attempt(t), x=await connect(), y=await connect();
    const results=await Promise.allSettled([confirm(x,t,a),confirm(y,t,b)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await db.query('select count(*)::int as n from platform_accounts where team_id=$1',[t.team])).rows[0].n,1);
  });
  await check('changed refresh snapshot is rejected without overwriting credentials', async () => {
    const t=await team(), old=await account(t), a=await attempt(t,old);
    await db.query("update platform_accounts set refresh_token='newer-token' where id=$1",[old.id]);
    await rejected(confirm(db,t,a,old),/changed/);
    assert.equal((await db.query('select refresh_token from platform_accounts where id=$1',[old.id])).rows[0].refresh_token,'newer-token');
  });
  await check('cancel wins a race while confirm waits for the attempt row', async () => {
    const t=await team(), a=await attempt(t), x=await connect(), y=await connect();
    await x.query('begin'); await x.query("update youtube_connection_attempts set status='cancelled',credential_envelope=null where id=$1",[a.id]);
    const waiting=confirm(y,t,a); const outcome=Promise.allSettled([waiting]); await delay(100); await x.query('commit');
    assert.equal((await outcome)[0].status,'rejected');
    assert.equal((await db.query('select count(*)::int as n from platform_accounts where team_id=$1',[t.team])).rows[0].n,0);
  });
  await check('confirmation wins without a later cancel deleting its account', async () => {
    const t=await team(), a=await attempt(t), x=await connect(), y=await connect();
    await x.query('begin'); const id=await confirm(x,t,a);
    const cancellation=y.query("update youtube_connection_attempts set status='cancelled',credential_envelope=null where id=$1 and status in ('started','exchanging','awaiting_confirmation','cancelled')",[a.id]);
    await delay(100); await x.query('commit'); assert.equal((await cancellation).rowCount,0);
    assert.equal((await db.query('select id from platform_accounts where id=$1',[id])).rowCount,1);
  });
  await check('expired and permission-revoked attempts cannot create accounts', async () => {
    const t=await team(), a=await attempt(t); await db.query("update youtube_connection_attempts set expires_at=now()-interval '1 second' where id=$1",[a.id]);
    await rejected(confirm(db,t,a),/no longer pending/);
    const b=await attempt(t); await db.query("update team_members set role='member' where team_id=$1",[t.team]);
    await rejected(confirm(db,t,b),/permission denied/);
  });
  await check('an attempt expiring while confirmation waits for a lock is rejected', async () => {
    const t=await team(), a=await attempt(t), x=await connect(), y=await connect();
    await x.query('begin'); await x.query("update youtube_connection_attempts set expires_at=clock_timestamp()+interval '300 milliseconds' where id=$1",[a.id]);
    const result=Promise.allSettled([confirm(y,t,a)]); await delay(450); await x.query('commit');
    assert.equal((await result)[0].status,'rejected');
  });
  await check('permission removal racing with confirmation fails closed', async () => {
    const t=await team(), a=await attempt(t), x=await connect(), y=await connect();
    await x.query('begin'); await x.query("update team_members set role='member' where team_id=$1",[t.team]);
    const result=Promise.allSettled([confirm(y,t,a)]); await delay(100); await x.query('commit');
    assert.equal((await result)[0].status,'rejected');
  });
  await check('deleting an account removes its pending credentials and identity metadata', async () => {
    const t=await team(), a=await attempt(t), id=await confirm(db,t,a);
    const old=(await db.query('select * from platform_accounts where id=$1',[id])).rows[0]; const pending=await attempt(t,old);
    await db.query('delete from platform_accounts where id=$1',[id]);
    assert.equal((await db.query('select * from youtube_connection_attempts where id=any($1::uuid[])',[[a.id,pending.id]])).rowCount,0);
    assert.equal((await db.query('select * from youtube_account_identity where platform_account_id=$1',[id])).rowCount,0);
  });
  await check('failure after credential update rolls back the entire transaction', async () => {
    const t=await team(), old=await account(t), a=await attempt(t,old);
    await db.query("update youtube_connection_attempts set identity=identity-'title' where id=$1",[a.id]);
    await rejected(confirm(db,t,a,old),/null value/);
    assert.equal((await db.query('select refresh_token from platform_accounts where id=$1',[old.id])).rows[0].refresh_token,old.refresh_token);
    assert.equal((await db.query('select status from youtube_connection_attempts where id=$1',[a.id])).rows[0].status,'awaiting_confirmation');
  });
  await check('cleanup scrubs expired secrets and retains recent confirmation receipts', async () => {
    const t=await team(), expired=await attempt(t), a=await attempt(t); await confirm(db,t,a);
    await db.query("update youtube_connection_attempts set expires_at=now()-interval '1 hour' where id=$1",[expired.id]);
    await db.query('select cleanup_youtube_connections()');
    const row=(await db.query('select status,credential_envelope from youtube_connection_attempts where id=$1',[expired.id])).rows[0];
    assert.equal(row.status,'expired'); assert.equal(row.credential_envelope,null);
    assert.equal((await db.query('select status from youtube_connection_attempts where id=$1',[a.id])).rows[0].status,'confirmed');
    await db.query("update youtube_connection_attempts set expires_at=now()-interval '25 hours' where id=$1",[expired.id]);
    await db.query('select cleanup_youtube_connections()'); assert.equal((await db.query('select id from youtube_connection_attempts where id=$1',[expired.id])).rowCount,0);
  });
  await check('concurrent metadata refresh claims allow only one Google lookup', async () => {
    const t=await team(), a=await account(t), x=await connect(), y=await connect();
    const result=await Promise.all([x,y].map(c=>c.query('select claim_youtube_identity_refresh($1) as allowed',[a.id])));
    assert.equal(result.filter(r=>r.rows[0].allowed).length,1);
  });
  console.log(`PASS ${count} real PostgreSQL integration cases`);
} finally {
  for (const c of clients) await c.end().catch(()=>{});
  const stopping=server.stop();
  if (process.platform==='win32') {
    // The package's taskkill may be restricted; pg_ctl shuts down only this cluster.
    const ctl=path.join(toolRoot,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
    await promisify(execFile)(ctl,['-D',clusterPath,'stop','-m','fast','-w'],{ windowsHide:true }).catch(()=>{});
  }
  await stopping;
}
