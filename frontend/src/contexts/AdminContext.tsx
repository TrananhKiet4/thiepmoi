import {createContext,useContext} from 'react';

export const Context=createContext<any>(null);
export function useAdmin(){return useContext(Context);}
