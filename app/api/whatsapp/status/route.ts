import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = searchParams.get('session');
  
  const WUZAPI_URL = "http://localhost:8080";
  const USER_TOKEN = `token_${session}`; 

  try {
    const res = await fetch(`${WUZAPI_URL}/session/status`, { 
        headers: { 
            'token': USER_TOKEN,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) return NextResponse.json({ connected: false });
    
    const data = await res.json();
    const info = data.data || data;

    // Logika persis seperti WuzapiService kamu
    const isLoggedIn = info.LoggedIn || info.loggedIn;
    const hasUser = info.Wid || info.wid || info.pushName || info.jid;

    return NextResponse.json({ 
      connected: !!(isLoggedIn || hasUser) 
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}