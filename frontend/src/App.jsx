import React, { useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

import BiotechIcon from "@mui/icons-material/Biotech";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";

import MetricPage from "./MetricPage";
import LeaderboardPanel from "./LeaderboardPanel";

export default function App() {
  const [pageMode, setPageMode] = useState("metric");

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <BiotechIcon color="primary" />
            <Typography variant="h6">GENATATOR Gene-level Metric & Leaderboard</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>
            Biologically rigorous assessment of ab initio genome annotation models
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3.2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <Button
              variant={pageMode === "metric" ? "contained" : "outlined"}
              size="large"
              onClick={() => setPageMode("metric")}
              startIcon={<BiotechIcon />}
            >
              Metric description
            </Button>
            <Button
              variant={pageMode === "leaderboard" ? "contained" : "outlined"}
              size="large"
              onClick={() => setPageMode("leaderboard")}
              startIcon={<LeaderboardIcon />}
            >
              API + leaderboard
            </Button>
          </Stack>

          {pageMode === "metric" ? <MetricPage /> : <LeaderboardPanel />}
        </Stack>
      </Container>
    </Box>
  );
}
