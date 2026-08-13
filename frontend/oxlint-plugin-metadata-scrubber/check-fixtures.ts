const cases = [] as const;

let hasFailure = false;
for (const _case of cases) {
  void _case;
}

if (hasFailure) process.exitCode = 1;
