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

import MetricPage from "./MetricPage";
import LeaderboardPanel from "./LeaderboardPanel";

export default function App() {
  const [pageMode, setPageMode] = useState("leaderboard");

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h6">Ab Initio Annotation Leaderboard and Metric</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3.2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <Button
              variant={pageMode === "leaderboard" ? "contained" : "outlined"}
              size="large"
              onClick={() => setPageMode("leaderboard")}
            >
              Leaderboard
            </Button>
            <Button
              variant={pageMode === "metric" ? "contained" : "outlined"}
              size="large"
              onClick={() => setPageMode("metric")}
            >
              Metric description
            </Button>
          </Stack>

          {pageMode === "metric" ? <MetricPage /> : <LeaderboardPanel />}
        </Stack>
      </Container>
    </Box>
  );
}
