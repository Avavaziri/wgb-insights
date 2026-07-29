// Shared error boundary for pages: shows a start-the-API hint instead
// of a stack trace when the backend isn't running.

export function ApiDown({ message }: { message: string }) {
  return (
    <div className="border-4 border-black p-8 text-center">
      <p className="text-2xl font-black">API not reachable</p>
      <p className="mt-2 text-neutral-600">{message}</p>
      <pre className="mx-auto mt-4 w-fit bg-black px-4 py-2 text-left text-[#FFE600]">
        conda activate wgb-insights{"\n"}make api
      </pre>
    </div>
  );
}
