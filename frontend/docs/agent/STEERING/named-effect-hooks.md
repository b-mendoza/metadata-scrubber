# Put Effects in purpose-named hooks

Scope: React Effects in this service.

Why: the hook name should explain the external synchronization that the Effect owns.

## Do's

### Keep Uppy construction and destruction in useUppyInstance

The `metadata-scrubber/use-effect-in-custom-hook` rule requires named custom hooks. Keep this lifecycle inside the existing `useUppyInstance(createUpload, maxFileSizeBytes)` hook:

```ts
const [uppy] = useState(() => createUppy(createUpload, maxFileSizeBytes));

useEffect(() => {
  return () => {
    uppy.destroy();
  };
}, [uppy]);

return uppy;
```

`FileUploader` calls `useUppyInstance(createUpload, maxFileSizeBytes)`. Keep event subscription and Dashboard rendering in `FileUploader`. The instance captures both creation inputs; remount `FileUploader` to apply changed values.

## Don'ts

### Do not move the Effect into the component or rely on naming alone

In the uploader module, this moves lifecycle ownership to the wrong function:

```tsx
export const FileUploader = (props: FileUploaderProps) => {
  const [uppy] = useState(() =>
    createUppy(props.createUpload, props.maxFileSizeBytes),
  );
  useEffect(() => () => uppy.destroy(), [uppy]);
  return <Dashboard uppy={uppy} />;
};
```

A generic name such as `useMount` can pass the static rule. Review whether the Effect is necessary and whether its name explains its purpose.
