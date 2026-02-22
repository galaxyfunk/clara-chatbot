import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Create response early
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Check if env vars are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Skip auth check if env vars missing - let the page handle it
    console.error('Middleware: Missing Supabase env vars');
    return response;
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Protect dashboard routes
    if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Redirect logged-in users away from login
    if (user && request.nextUrl.pathname === '/login') {
      const dashboardUrl = new URL('/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  } catch (error) {
    console.error('Middleware auth error:', error);
    // On error, allow the request to proceed - page will handle auth
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
