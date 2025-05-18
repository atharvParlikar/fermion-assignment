export default function Home() {
  const baseUrl = "http://localhost:3000";

  return (
    <div className="flex flex-col h-screen w-screen justify-center items-center text-left">
      <span>Why are you even here?</span>
      <span>here are links to stream and watch so you don't have to click</span>

      <a className="text-blue-600" href={baseUrl + "/stream"}>/stream</a>
      <a className="text-blue-600" href={baseUrl + "/watch"}>/watch</a>
    </div>
  );
}
