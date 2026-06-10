import { Spinner } from "#/shared/components/spinner/spinner.mod";

interface LoadingFallbackProps {
  message: string;
}

export const LoadingFallback = (props: LoadingFallbackProps) => {
  const { message } = props;

  return (
    <div className="flex items-center gap-2">
      <Spinner />

      <h2>{message}</h2>
    </div>
  );
};
