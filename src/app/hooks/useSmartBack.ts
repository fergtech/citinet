import { useNavigate } from 'react-router-dom';
import { hasNavigationHistory } from './navigationHistory';
import { hubPath } from '../utils/subdomain';

/**
 * Like navigate(-1), but falls back to the hub dashboard when there's no
 * real in-app history to go back to. See navigationHistory.ts for why that
 * case matters more than it looks: no browser chrome on the installed PWA
 * means there's no other way back at all.
 */
export function useSmartBack(): () => void {
  const navigate = useNavigate();
  return () => {
    if (hasNavigationHistory()) {
      navigate(-1);
    } else {
      navigate(hubPath('/'));
    }
  };
}
