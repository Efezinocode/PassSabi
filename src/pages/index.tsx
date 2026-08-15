import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-primary text-white">
      <Head>
        <title>PassSabi AI</title>
      </Head>

      <main className="px-4 py-12 max-w-screen-md mx-auto">
        <h1 className="text-3xl font-semibold mb-4">PassSabi AI</h1>
        <p className="mb-6">Your personal AI teacher for WAEC, JAMB and more — Nigeria-focused learning.</p>
        <div className="space-x-4">
          <Link href="/auth/signup" className="px-4 py-2 bg-accent text-black rounded">Start Learning</Link>
          <Link href="/auth/login" className="px-4 py-2 border border-white rounded">Login</Link>
        </div>
      </main>
    </div>
  );
}
