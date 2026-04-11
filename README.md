# zillit-catering-api

Backend for the Zillit Catering + Craft Service experience. Shared with the
iOS catering app — same wire format, same AES-256-CBC encrypted chat, same
`moduledata` / `bodyhash` request envelope.

## Stack

- Node 20 + TypeScript (strict) + ES modules
- Express 4 + Mongoose 8
- JWT auth, Zod validation, helmet, express-rate-limit, CORS
- Socket.io 4 for realtime
- Multer for uploads (local disk)

## Module architecture

Two top-level modules mounted symmetrically:

```
/api/v2/catering/*     ← moduleRouter('catering')
/api/v2/craftservice/* ← moduleRouter('craftservice')
```

A single `moduleRouter(moduleId)` factory produces the full endpoint tree
(units / menu / chat / comments). Every document has a `module` discriminator
field and every controller scopes its queries via `req.moduleId`, so adding a
third module is a one-line mount.

## Quickstart

```sh
cp .env.example .env          # edit MONGO_URL + JWT_SECRET if needed
npm install
npm run dev                   # tsx watch on PORT
npm run seed                  # optional: seed dev users + units
```

Dev server listens on `http://localhost:4000` by default.

## Environment

See `.env.example`. Required:

| Var | Purpose |
|---|---|
| `MONGO_URL` | mongo connection string |
| `JWT_SECRET` | HS256 signing key |
| `PORT` | HTTP port (default 4000) |
| `AES_KEY` | 32-byte UTF-8 key for chat body encryption |
| `AES_IV` | 16-byte IV (matches iOS `Brxd-7fAiRQFYz2e`) |
| `CORS_ORIGIN` | comma-separated allowed origins |

`AES_KEY` and `AES_IV` MUST match the iOS / web client values to share chat
data across clients.

## Endpoints (per module)

Every path below exists under both `/api/v2/catering` and
`/api/v2/craftservice`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/unit` | List enabled units |
| `POST` | `/unit` | Create unit (admin) |
| `PUT` | `/unit/:unitId` | Update unit |
| `GET` | `/menu/:unitId` | List menu items |
| `POST` | `/menu` | Create menu item |
| `PUT` | `/menu/:menuItemId` | Update menu item |
| `DELETE` | `/menu/:menuItemId` | Soft-delete menu item |
| `GET` | `/chat/:unitId/:lastUpdated/:orderType` | Paginated chat history |
| `POST` | `/chat` | Send chat message (encrypted body) |
| `PUT` | `/chat/:messageId` | Edit message |
| `DELETE` | `/chat/:messageId` | Soft-delete message |
| `PUT` | `/chat/delete/chats` | Bulk soft-delete |
| `PUT` | `/chat/archive` | Archive messages |
| `POST` | `/chat/comments/:messageId` | Reply (encrypted body) |
| `PUT` | `/chat/comments/:messageId/:commentId` | Edit reply |
| `DELETE` | `/chat/comments/:messageId/:commentId` | Delete reply |

Auth + uploads (not module-scoped):

| Method | Path |
|---|---|
| `POST` | `/api/v2/auth/register` |
| `POST` | `/api/v2/auth/login` |
| `GET` | `/api/v2/auth/me` |
| `POST` | `/api/v2/upload` |

## Wire format

Requests and responses use `snake_case` keys with alphabetically-sorted
output. The `message` field on chat payloads is AES-256-CBC encrypted hex;
the server validates + decrypts as needed and stores it already encrypted so
the iOS client and web client see byte-identical payloads.

Each request must include:

- `Authorization: Bearer <jwt>`
- `moduledata: <aes-encrypted hex>` — JSON of `{user_id, project_id, device_id, time_stamp}`, timestamp must be within ±5 minutes
- `bodyhash: <sha-256 hex>` — `sha256({"payload":<body>,"moduledata":"<hex>"}\|<salt>)`

In development the `moduleData` middleware accepts a missing header and
falls back to the JWT's `user.projectId`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | tsx watch server |
| `npm run build` | compile to `dist/` |
| `npm run start` | run compiled dist |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | seed dev users + units |

## Layout

```
src/
├── index.ts                   # bootstrap
├── config/{env,db}.ts
├── shared/{crypto,wireFormat,response,errors,types}.ts
├── middleware/{auth,moduleData,requireRole,validate,errorHandler}.ts
├── shared-modules/
│   ├── models/{User,Unit,MenuItem,ChatMessage}.ts
│   ├── controllers/{unit,menu,chat,comment}.controller.ts
│   └── moduleRouter.ts        # mounts the full tree per module
├── auth/
├── uploads/
├── scripts/seed.ts
└── socket.ts
```
