# Contributing

Thanks for helping improve Atlas. This guide keeps contributions consistent and easy to review.

## Getting Set Up

```bash
./init.sh
```

Or manually:

```bash
cd server && npm install
npm run init-db
npm start

cd client && npm install
npm start
```

## Development Workflow

1. Create a branch for your change.
2. Keep changes focused and small.
3. Prefer clear names for variables, functions, and files.
4. Update documentation when behavior changes.

## Project Conventions

- **Client:** React + CSS Modules in `client/src`
- **Server:** Express routes in `server/src/routes`
- **Database:** SQLite created locally; never commit `.db` files
- **Uploads:** Stored locally in `server/uploads` and ignored in git

## Testing

There is no formal test suite yet. If your change is risky, include a short manual test plan in the PR description.

## Reporting Issues

When filing a bug, include:

- Steps to reproduce
- Expected vs. actual behavior
- Screenshots or logs when relevant
