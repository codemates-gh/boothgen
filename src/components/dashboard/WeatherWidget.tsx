'use client';
import { useState, useEffect } from 'react';
import { Sun, Cloud, CloudRain, CloudSnow, Zap, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';

function weatherInfo(code: number) {
  if (code === 0 || code === 1) return { label: 'Clear',       Icon: Sun,       cls: 'text-yellow-400' };
  if (code <= 3)                 return { label: 'Cloudy',      Icon: Cloud,     cls: 'text-gray-400'   };
  if (code <= 48)                return { label: 'Foggy',       Icon: Cloud,     cls: 'text-gray-400'   };
  if (code <= 67)                return { label: 'Rain',        Icon: CloudRain, cls: 'text-blue-400'   };
  if (code <= 77)                return { label: 'Snow',        Icon: CloudSnow, cls: 'text-blue-300'   };
  if (code <= 82)                return { label: 'Showers',     Icon: CloudRain, cls: 'text-blue-400'   };
  return                                { label: 'Thunderstorm',Icon: Zap,       cls: 'text-purple-500' };
}

export default function WeatherWidget() {
  const [forecast, setForecast] = useState<any>(null);
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const loc = await fetch('https://ipapi.co/json/').then(r => r.json());
        if (!loc.latitude) return;
        setCity(`${loc.city}, ${loc.region_code}`);
        const wx = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&temperature_unit=fahrenheit&timezone=auto&forecast_days=5`
        ).then(r => r.json());
        setForecast(wx.daily);
      } catch { /* silent fail */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="w-4 h-4 text-brand" />
          Weather
          {city && <span className="text-sm font-normal text-gray-500 ml-1">— {city}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-5 gap-2">
            {[0,1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : !forecast ? (
          <p className="text-sm text-gray-400">Weather unavailable</p>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {forecast.time.map((date: string, i: number) => {
              const { label, Icon, cls } = weatherInfo(forecast.weather_code[i]);
              const precip = forecast.precipitation_probability_max[i];
              return (
                <div key={date} className={`flex flex-col items-center p-2.5 rounded-xl text-center ${i === 0 ? 'bg-brand/5 border border-brand/20' : 'bg-gray-50'}`}>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">
                    {i === 0 ? 'Today' : format(parseISO(date), 'EEE')}
                  </p>
                  <Icon className={`w-7 h-7 mb-1 ${cls}`} />
                  <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                  <p className="text-sm font-bold text-gray-900">{Math.round(forecast.temperature_2m_max[i])}°</p>
                  <p className="text-xs text-gray-400">{Math.round(forecast.temperature_2m_min[i])}°</p>
                  {precip > 20 && (
                    <p className="text-[10px] text-blue-400 mt-0.5">{precip}% rain</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
