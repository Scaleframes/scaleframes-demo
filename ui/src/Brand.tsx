import React from 'react';
import {Box, keyframes} from '@mui/material';

export const BrandHeader = ({right}: {right?: React.ReactNode}) => (
    <Box
        component="header"
        sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: {xs: 2, sm: 3},
            py: 2,
            borderBottom: 1,
            borderColor: 'divider',
        }}
    >
        <img
            src="./logo.png"
            alt="Scaleframes"
            style={{height: 22, width: 'auto', display: 'block'}}
        />
        {right}
    </Box>
);

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(255, 107, 0, 0.45); }
  70% { box-shadow: 0 0 0 14px rgba(255, 107, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 107, 0, 0); }
`;

export const PulseDot = ({size = 14}: {size?: number}) => (
    <Box
        sx={{
            width: size,
            height: size,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            animation: `${pulse} 1.6s ease-out infinite`,
        }}
    />
);

export const LivePill = ({label}: {label: string}) => (
    <Box
        sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.5,
            borderRadius: 999,
            bgcolor: 'primary.main',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: 0.4,
        }}
    >
        <Box sx={{width: 7, height: 7, borderRadius: '50%', bgcolor: '#fff'}} />
        {label}
    </Box>
);
