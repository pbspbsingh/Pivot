import { useEffect, useId } from 'react';

declare global {
  interface Window {
    TradingView: {
      widget: new (config: object) => void;
    };
  }
}

interface Props {
  exchange: string;
  symbol: string;
}

export function TvChart({ exchange, symbol }: Props) {
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    if (!window.TradingView) return;

    const studies = ['MASimple@tv-basicstudies', 'STD;MA%Ribbon'];

    new window.TradingView.widget({
      container_id: id,
      symbol: `${exchange}:${symbol}`,
      interval: 'D',
      timezone: 'America/Los_Angeles',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#1e1e1e',
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      autosize: true,
      studies,
      studies_overrides: {
        'moving average.length': 10,
        'moving average.ma.color': '#5693e7',
      },
      loading_screen: { backgroundColor: '#1e1e1e' },
    });
  }, [id, exchange, symbol]);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <div id={id} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
